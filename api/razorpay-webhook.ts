import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { createHmac, timingSafeEqual } from 'crypto';

// Independent, server-to-server confirmation that a payment actually
// completed - the second (and more reliable) half of api/checkout.ts's
// verifyPayment. That client callback can simply never fire (closed tab,
// lost network, browser crash right after paying) even though Razorpay
// captured the money; this webhook is Razorpay calling *us*, so it doesn't
// depend on the student's browser at all. Register this URL
// (https://<domain>/api/razorpay-webhook) plus a webhook secret in the
// Razorpay Dashboard → Settings → Webhooks, subscribed to "payment.captured"
// - that's a Razorpay-dashboard action only the account owner can do.
//
// No Firebase auth here - the caller is Razorpay's servers, not a signed-in
// user. Authenticity instead comes from the X-Razorpay-Signature header,
// an HMAC-SHA256 of the *raw* request body using the webhook secret. That
// means Vercel's automatic JSON body-parsing has to be turned off (a parsed
// body re-serialized wouldn't byte-for-byte match what Razorpay signed) -
// hence reading the stream manually below.
//
// Self-contained - see api/auth.ts's header comment for why (no shared code
// across api/*.ts). finalizeOrder duplicates api/checkout.ts's function of
// the same name rather than importing it; it's intentionally idempotent
// (no-ops once an order is already 'paid') so it's safe if both this webhook
// and the client's verifyPayment call land for the same order.
export const config = { api: { bodyParser: false } };

function getAdminApp() {
  if (getApps().length) return getApps()[0];
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Firebase Admin service account env vars are not configured');
  }
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}
const db = getFirestore(getAdminApp());
db.settings({ ignoreUndefinedProperties: true });

type ItemType = 'quiz' | 'practiceTest' | 'package';

// Refer & Earn - the referrer's reward is real HelpCertify credit (not a
// coupon): non-withdrawable, always a flat money amount (a percentage
// doesn't make sense for a standing balance not tied to one specific
// purchase at grant time - that's the referee's coupon instead), spendable
// across future purchases up to a percentage cap (see
// api/checkout.ts's applyMyCredit), only becomes spendable after a
// validation/holding period, and can be clawed back on refund (see
// api/admin.ts's refundOrder). Granted only once the referee's first
// *eligible* order is actually paid (never on signup alone - see
// ReferralDoc). Amount/validation-period/expiry/eligible-items/monthly-
// limit are all admin-configurable (see api/admin.ts's
// getAppSettings/updateAppSettings); the defaults below are only the
// fallback for a doc that predates that control. Duplicated in
// api/checkout.ts's own finalizeOrder, same no-shared-code convention as
// everything else here.
const REFERRAL_CREDIT_AMOUNT_DEFAULT_MINOR = 25000; // ₹250, in paise
const REFERRAL_VALIDATION_DAYS_DEFAULT = 7;
const REFERRAL_CREDIT_EXPIRY_DAYS_DEFAULT = 90;
const REFERRAL_MONTHLY_LIMIT_DEFAULT = 10;

async function processReferralOnPurchase(
  refereeUid: string,
  orderId: string,
  orderItems: { itemType: ItemType; itemId: string }[],
  batch: FirebaseFirestore.WriteBatch
): Promise<void> {
  const priorPaidOrders = await db.collection('orders').where('userId', '==', refereeUid).where('status', '==', 'paid').limit(1).get();
  if (!priorPaidOrders.empty) return; // not their first purchase

  const referralRef = db.collection('referrals').doc(refereeUid);
  const referralSnap = await referralRef.get();
  if (!referralSnap.exists || referralSnap.data()!.status !== 'registered') return;
  const referral = referralSnap.data()!;

  const settingsSnap = await db.collection('appSettings').doc('general').get();
  const settings = settingsSnap.data();

  const eligibleItemIds: string[] = settings?.referralEligibleItemIds ?? [];
  const hasEligibleItem = eligibleItemIds.length === 0 || orderItems.some((i) => eligibleItemIds.includes(i.itemId));
  if (!hasEligibleItem) return; // none of this order's items qualify - referral stays 'registered' for a later purchase

  // Monthly cap - fetch this referrer's own entries and filter in memory
  // rather than adding a range (grantedAt) + equality (referrerUid) query,
  // matching this codebase's existing convention of avoiding a composite-
  // index requirement for a query this small (see getUserDetailAdmin's
  // own comment in api/admin.ts for the same reasoning).
  const monthlyLimit: number = settings?.referralMonthlyLimit ?? REFERRAL_MONTHLY_LIMIT_DEFAULT;
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const existingEntriesSnap = await db.collection('creditLedgerEntries').where('referrerUid', '==', referral.referrerUid).get();
  const grantsThisMonth = existingEntriesSnap.docs.filter((d) => (d.data().grantedAt as Timestamp).toMillis() >= startOfMonth.getTime()).length;
  if (grantsThisMonth >= monthlyLimit) {
    batch.update(referralRef, {
      status: 'rejected',
      rejectionReason: "Referrer's monthly referral reward limit reached",
      qualifyingOrderId: orderId,
    });
    return;
  }

  const amountMinor: number = settings?.referralCreditAmountMinor ?? REFERRAL_CREDIT_AMOUNT_DEFAULT_MINOR;
  const validationDays: number = settings?.referralValidationPeriodDays ?? REFERRAL_VALIDATION_DAYS_DEFAULT;
  const expiryDays: number = settings?.referralCreditExpiryDays ?? REFERRAL_CREDIT_EXPIRY_DAYS_DEFAULT;

  const grantedAt = Timestamp.now();
  // Doc id is deliberately the order id, not auto-generated - a retried
  // webhook/duplicate confirmation for the same order overwrites this
  // same doc instead of minting a second entry (item 17's idempotency).
  batch.set(db.collection('creditLedgerEntries').doc(orderId), {
    referrerUid: referral.referrerUid,
    referralId: refereeUid,
    amountMinor,
    remainingMinor: amountMinor,
    status: 'pending_validation',
    grantedAt,
    validationEndsAt: Timestamp.fromMillis(grantedAt.toMillis() + validationDays * 24 * 60 * 60 * 1000),
    expiresAt: Timestamp.fromMillis(grantedAt.toMillis() + expiryDays * 24 * 60 * 60 * 1000),
    reversedAt: null,
    reversalReason: null,
  });
  batch.update(referralRef, {
    status: 'pending',
    qualifyingOrderId: orderId,
    creditEntryId: orderId,
  });
}

// Partner commission (Phase 2). The attribution + policy were frozen onto
// order.partnerAttribution at createOrder time; here we just materialise the
// commission from that snapshot. Duplicated verbatim from api/checkout.ts,
// same no-shared-code convention. Tested spec:
// src/features/partner/lib/commission.ts.
const PARTNER_PRODUCT_ID = 'HELPCERTIFY';

async function holdDaysForOrder(): Promise<number> {
  try {
    const snap = await db.collection('appSettings').doc('general').get();
    const w = Number(snap.data()?.refundWindowDays);
    return Math.max(7, Number.isFinite(w) && w > 0 ? w : 0);
  } catch {
    return 7;
  }
}

function addCommissionToBatch(
  batch: FirebaseFirestore.WriteBatch,
  orderId: string,
  order: FirebaseFirestore.DocumentData,
  holdDays: number,
): void {
  const a = order.partnerAttribution;
  if (!a || a.commissionable !== true) return;

  const baseMinor = Math.max(0, Number(a.commissionBaseMinor) || 0);
  const bp = Number(a.commissionRateBasisPoints) || 0;
  const uncapped = Math.floor((baseMinor * bp) / 10000 + 0.5); // round half up
  const cap = typeof a.maxCommissionMinor === 'number' ? a.maxCommissionMinor : null;
  const gross = cap != null && uncapped > cap ? cap : uncapped;
  const holdUntil = Timestamp.fromMillis(Date.now() + holdDays * 24 * 60 * 60 * 1000);

  batch.set(db.collection('commissions').doc(orderId), {
    orderId,
    partnerId: a.partnerId,
    productId: PARTNER_PRODUCT_ID,
    customerId: order.userId,
    currency: order.currency ?? 'INR',
    eligibleBaseMinor: baseMinor,
    rateBasisPoints: bp,
    grossCommissionMinor: gross,
    deductionsMinor: 0,
    netPayableMinor: gross,
    status: 'PENDING_HOLD',
    holdUntil,
    onHoldReason: null,
    commissionPolicyId: a.commissionPolicyId,
    commissionPolicyVersion: a.commissionPolicyVersion,
    payoutBatchId: null,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  batch.set(db.collection('commissionLedger').doc(), {
    commissionId: orderId,
    orderId,
    partnerId: a.partnerId,
    fromStatus: null,
    toStatus: 'PENDING_HOLD',
    amountMinor: gross,
    reason: 'Order paid; refund hold started',
    actorId: 'system',
    actorType: 'system',
    createdAt: Timestamp.now(),
  });
}

async function finalizeOrder(orderId: string, razorpayPaymentId: string): Promise<'paid' | 'already_paid' | 'not_found'> {
  const ref = db.collection('orders').doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) return 'not_found';
  const order = snap.data()!;
  // Also skips an already-refunded order - same
  // shouldSkipAlreadyProcessedOrder guard as referralRules.ts's tested
  // version (see api/admin.ts's refundOrder for the other side of this).
  if (order.status === 'paid' || order.status === 'refunded') return 'already_paid';

  // Read before marking paid - processReferralOnPurchase's "is this their
  // first purchase" check needs to see the world as it was before this
  // order counted as paid.
  const batch = db.batch();
  await processReferralOnPurchase(order.userId, orderId, order.items as { itemType: ItemType; itemId: string }[], batch);

  if (order.partnerAttribution?.commissionable === true) {
    const commissionExists = (await db.collection('commissions').doc(orderId).get()).exists;
    if (!commissionExists) addCommissionToBatch(batch, orderId, order, await holdDaysForOrder());
  }

  // In the batch with the entitlement writes so finalize is all-or-nothing
  // (mirrors api/checkout.ts).
  batch.update(ref, { status: 'paid', razorpayPaymentId, paidAt: Timestamp.now() });

  for (const item of order.items as { itemType: ItemType; itemId: string }[]) {
    if (item.itemType === 'package') {
      // A package doesn't get its own purchase doc - it fans out to one
      // purchase doc per included item, same as api/checkout.ts's own
      // finalizeOrder (duplicated here, same no-shared-code convention).
      // See PackageDoc's own comment in src/types/models.ts.
      const pkgSnap = await db.collection('packages').doc(item.itemId).get();
      const pkgData = pkgSnap.data();
      if (!pkgData) continue; // package deleted between order creation and payment - nothing to grant
      const includedQuizIds: string[] = pkgData.includedQuizIds ?? [];
      const includedPracticeTestIds: string[] = pkgData.includedPracticeTestIds ?? [];
      // Time-boxed package access: purchasedAt + accessValidityDays, null
      // for a package with no validity set. Mirrors api/checkout.ts.
      const validityDays: number = pkgData.accessValidityDays ?? 0;
      const pkgExpiresAt =
        validityDays > 0 ? Timestamp.fromMillis(Date.now() + validityDays * 24 * 60 * 60 * 1000) : null;
      for (const quizId of includedQuizIds) {
        batch.set(db.collection('purchases').doc(`${order.userId}_quiz_${quizId}`), {
          userId: order.userId,
          itemType: 'quiz',
          itemId: quizId,
          orderId,
          purchasedAt: Timestamp.now(),
          sourcePackageId: item.itemId,
          expiresAt: pkgExpiresAt,
        });
      }
      for (const testId of includedPracticeTestIds) {
        batch.set(db.collection('purchases').doc(`${order.userId}_practiceTest_${testId}`), {
          userId: order.userId,
          itemType: 'practiceTest',
          itemId: testId,
          orderId,
          purchasedAt: Timestamp.now(),
          sourcePackageId: item.itemId,
          expiresAt: pkgExpiresAt,
        });
      }
      continue;
    }
    batch.set(db.collection('purchases').doc(`${order.userId}_${item.itemType}_${item.itemId}`), {
      userId: order.userId,
      itemType: item.itemType,
      itemId: item.itemId,
      orderId,
      purchasedAt: Timestamp.now(),
    });
  }
  if (order.couponCode) {
    batch.set(
      db.collection('coupons').doc(String(order.couponCode).toUpperCase()),
      { usedCount: FieldValue.increment(1) },
      { merge: true },
    );
  }
  // Only clear the cart for an order that actually came from it - see
  // api/checkout.ts's finalizeOrder (same logic, duplicated here) for why.
  if (order.fromCart) {
    batch.set(db.collection('carts').doc(order.userId), { items: [], couponCode: null, updatedAt: Timestamp.now() }, { merge: true });
  }
  await batch.commit();

  // One-time patch of the payment id onto the immutable purchase-consent
  // record (see api/checkout.ts's finalizeOrder - same best-effort patch).
  await db
    .collection('purchaseConsents')
    .doc(orderId)
    .set({ razorpayPaymentId, paidAt: Timestamp.now() }, { merge: true })
    .catch((e) => console.error('purchaseConsents paidAt patch failed:', orderId, e));

  return 'paid';
}

function readRawBody(req: VercelRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('razorpay-webhook: RAZORPAY_WEBHOOK_SECRET is not configured');
    res.status(500).json({ error: 'Webhook not configured' });
    return;
  }

  const raw = await readRawBody(req);
  const signatureHeader = req.headers['x-razorpay-signature'];
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (!signature) {
    res.status(400).json({ error: 'Missing signature' });
    return;
  }

  const expected = createHmac('sha256', secret).update(raw).digest('hex');
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signature);
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    res.status(400).json({ error: 'Invalid signature' });
    return;
  }

  let event: { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string } } } };
  try {
    event = JSON.parse(raw);
  } catch {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }

  if (event.event !== 'payment.captured') {
    // Acknowledge anything we don't act on so Razorpay stops retrying it.
    res.status(200).json({ received: true, ignored: true });
    return;
  }

  const payment = event.payload?.payment?.entity;
  const razorpayOrderId = payment?.order_id;
  const razorpayPaymentId = payment?.id;
  if (!razorpayOrderId || !razorpayPaymentId) {
    res.status(200).json({ received: true, ignored: true });
    return;
  }

  try {
    const ordersSnap = await db.collection('orders').where('razorpayOrderId', '==', razorpayOrderId).limit(1).get();
    if (ordersSnap.empty) {
      console.error('razorpay-webhook: no order found for', razorpayOrderId);
      res.status(200).json({ received: true, ignored: true });
      return;
    }
    await finalizeOrder(ordersSnap.docs[0].id, razorpayPaymentId);
    res.status(200).json({ received: true });
  } catch (err) {
    console.error('razorpay-webhook handler error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
}
