import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { createHmac, timingSafeEqual } from 'crypto';

// Razorpay checkout: create an Order server-side (recomputing every price
// from the live quiz/practiceTest docs - the client never gets to state an
// amount), then verify the payment signature Razorpay's Checkout.js hands
// back before granting entitlements. api/razorpay-webhook.ts is the second,
// independent confirmation path (in case the client never calls verifyPayment
// - closed tab, lost connection, etc.) - it duplicates the "mark paid + grant
// entitlements" logic below rather than importing it, matching this
// project's no-shared-code-across-api/*.ts convention (see api/auth.ts's
// header comment).

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
const adminAuth = getAuth(getAdminApp());
const db = getFirestore(getAdminApp());
db.settings({ ignoreUndefinedProperties: true });

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}
const Err = {
  unauthenticated: (m = 'Authentication required') => new HttpError(401, m),
  notFound: (m = 'Resource not found') => new HttpError(404, m),
  invalidArgument: (m: string, details?: unknown) => new HttpError(422, m, details),
  failedPrecondition: (m: string) => new HttpError(409, m),
};

async function requireStudent(req: VercelRequest): Promise<{ uid: string }> {
  const authHeader = req.headers.authorization ?? '';
  const token = (Array.isArray(authHeader) ? authHeader[0] : authHeader).replace(/^Bearer\s+/i, '');
  if (!token) throw Err.unauthenticated();
  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch {
    throw Err.unauthenticated('Invalid or expired token');
  }
  const snap = await db.collection('users').doc(decoded.uid).get();
  if (!snap.exists || !snap.data()?.isActive) throw Err.unauthenticated('Account not found or deactivated');
  return { uid: decoded.uid };
}

type ItemType = 'quiz' | 'practiceTest' | 'package';
const collectionFor = (itemType: ItemType) =>
  itemType === 'quiz' ? 'quizzes' : itemType === 'practiceTest' ? 'practiceTests' : 'packages';

// A package is never its own entitlement record - "already own this
// package" means every included quiz/practiceTest already has its own
// purchase doc. Duplicated from api/cart.ts, same no-shared-code
// convention as everything else here.
async function isPackageFullyOwned(uid: string, pkg: FirebaseFirestore.DocumentData): Promise<boolean> {
  const includedQuizIds: string[] = pkg.includedQuizIds ?? [];
  const includedPracticeTestIds: string[] = pkg.includedPracticeTestIds ?? [];
  if (includedQuizIds.length === 0 && includedPracticeTestIds.length === 0) return false;
  const refs = [
    ...includedQuizIds.map((id) => db.collection('purchases').doc(`${uid}_quiz_${id}`)),
    ...includedPracticeTestIds.map((id) => db.collection('purchases').doc(`${uid}_practiceTest_${id}`)),
  ];
  const snaps = await db.getAll(...refs);
  return snaps.every((s) => s.exists);
}

function getRazorpayCreds() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error('Razorpay env vars are not configured');
  return { keyId, keySecret };
}

async function validateCoupon(code: string, uid: string) {
  const snap = await db.collection('coupons').doc(code.toUpperCase()).get();
  if (!snap.exists) return null;
  const c = snap.data()!;
  if (!c.active) return null;
  if (c.expiresAt && (c.expiresAt as Timestamp).toMillis() < Date.now()) return null;
  if (c.maxUses !== null && c.maxUses !== undefined && c.usedCount >= c.maxUses) return null;
  // Refer & Earn reward coupons are minted for one specific learner - see
  // CouponDoc.restrictedToUserId. Absent on every admin-created coupon, so
  // this never affects the normal any-signed-in-learner codes.
  if (c.restrictedToUserId && c.restrictedToUserId !== uid) return null;
  return c;
}

function computeDiscount(coupon: FirebaseFirestore.DocumentData, subtotal: number): number {
  if (subtotal <= 0) return 0;
  const raw = coupon.discountType === 'percent' ? Math.round((subtotal * coupon.discountValue) / 100) : coupon.discountValue;
  return Math.min(raw, Math.max(subtotal - 100, 0));
}

// Duplicated from src/features/marketing/policyVersions.ts - api/*.ts can't
// import from src/. This server copy is the authoritative one recorded on
// the order and the purchase-consent doc.
const POLICY_VERSIONS = {
  terms: '2026-08-29',
  refund: '2026-08-29',
  privacy: '2026-08-29',
  support: '2026-08-29',
} as const;

function accessPeriodLabelFor(days: number | null | undefined): string {
  if (!days || days <= 0) return 'Lifetime access';
  if (days % 365 === 0) {
    const years = days / 365;
    return `${years} year${years === 1 ? '' : 's'}`;
  }
  return `${days} days`;
}

// The four mandatory purchase-consent acknowledgements. z.literal(true)
// makes a missing or unticked box a hard validation failure - the Pay
// button being disabled client-side is a convenience, this is the gate.
const consentSchema = z.object({
  correctProduct: z.literal(true),
  previewAcknowledged: z.literal(true),
  policiesAccepted: z.literal(true),
  technicalPolicyAcknowledged: z.literal(true),
  acceptedAt: z.string().datetime(),
  policyVersions: z.record(z.string()).optional(),
});

const createOrderSchema = z.object({
  consent: consentSchema,
  // Buy Now: a direct, single-item order that bypasses the cart entirely
  // - (see finalizeOrder) doesn't touch whatever else might be sitting in
  // the student's actual cart. couponCode here is a code typed directly
  // into the Buy Now dialog, separate from whatever the cart itself has
  // stored.
  buyNowItem: z.object({ itemType: z.enum(['quiz', 'practiceTest']), itemId: z.string().min(1) }).optional(),
  couponCode: z.string().trim().min(1).optional(),
  // Refer & Earn credit - a separate lever from a coupon code (both can
  // apply to the same order); see applyMyCredit below.
  useCredit: z.boolean().optional(),
});

const REFERRAL_CREDIT_MAX_PERCENT_DEFAULT = 25;

// Refer & Earn credit - sums this buyer's own *currently active* credit
// entries (recomputed from timestamps, not trusted from a possibly-stale
// stored status - see CreditLedgerEntryDoc's own comment), applies
// computeCreditApplicable's cap (min of maxPercent-of-subtotal and what's
// actually available), and consumes it oldest-expiring-first across
// entries. Returns 0/empty when useCredit wasn't requested or there's
// nothing spendable - never throws, since "no credit to apply" isn't an
// error the way an invalid typed-in coupon code is.
async function applyMyCredit(
  uid: string,
  subtotal: number,
  useCredit: boolean | undefined
): Promise<{ appliedMinor: number; entryIdsUsed: string[]; writes: () => void }> {
  if (!useCredit) return { appliedMinor: 0, entryIdsUsed: [], writes: () => {} };

  const settingsSnap = await db.collection('appSettings').doc('general').get();
  const maxPercent: number = settingsSnap.data()?.referralCreditMaxPercent ?? REFERRAL_CREDIT_MAX_PERCENT_DEFAULT;

  interface CreditEntryRow {
    ref: FirebaseFirestore.DocumentReference;
    status: string;
    remainingMinor: number;
    validationEndsAt: Timestamp;
    expiresAt: Timestamp;
  }

  const entriesSnap = await db.collection('creditLedgerEntries').where('referrerUid', '==', uid).get();
  const now = Date.now();
  const activeEntries = entriesSnap.docs
    .map((d) => ({ ref: d.ref, ...(d.data() as Omit<CreditEntryRow, 'ref'>) }))
    .filter((e) => e.status !== 'depleted' && e.status !== 'reversed')
    .map((e) => {
      const validationEndsAtMs = (e.validationEndsAt as Timestamp).toMillis();
      const expiresAtMs = (e.expiresAt as Timestamp).toMillis();
      const liveStatus = now >= expiresAtMs ? 'expired' : now >= validationEndsAtMs ? 'active' : 'pending_validation';
      return { ...e, liveStatus, expiresAtMs };
    })
    .filter((e) => e.liveStatus === 'active')
    .sort((a, b) => a.expiresAtMs - b.expiresAtMs); // spend soonest-expiring first

  const availableMinor = activeEntries.reduce((sum, e) => sum + e.remainingMinor, 0);
  const applicable = computeCreditApplicableInline(subtotal, availableMinor, maxPercent);
  if (applicable <= 0) return { appliedMinor: 0, entryIdsUsed: [], writes: () => {} };

  let remaining = applicable;
  const entryIdsUsed: string[] = [];
  const consumptions: { ref: FirebaseFirestore.DocumentReference; newRemaining: number }[] = [];
  for (const entry of activeEntries) {
    if (remaining <= 0) break;
    const drawn = Math.min(entry.remainingMinor, remaining);
    if (drawn <= 0) continue;
    remaining -= drawn;
    entryIdsUsed.push(entry.ref.id);
    consumptions.push({ ref: entry.ref, newRemaining: entry.remainingMinor - drawn });
  }

  return {
    appliedMinor: applicable,
    entryIdsUsed,
    // Deferred until after the Razorpay order is confirmed created, so a
    // failed order-creation call never leaves credit half-consumed.
    writes: () => {
      for (const c of consumptions) {
        c.ref.update({ remainingMinor: c.newRemaining, status: c.newRemaining <= 0 ? 'depleted' : 'active' });
      }
    },
  };
}

// Mirrors src/features/students/lib/referralRules.ts's
// computeCreditApplicable - that module is the tested, canonical version;
// duplicated inline since api/*.ts files can't import across each other
// or from src/ (see api/auth.ts's header comment).
function computeCreditApplicableInline(subtotalMinor: number, availableMinor: number, maxPercent: number): number {
  if (subtotalMinor <= 0 || availableMinor <= 0 || maxPercent <= 0) return 0;
  const cap = Math.floor((subtotalMinor * maxPercent) / 100);
  return Math.max(0, Math.min(cap, availableMinor, subtotalMinor));
}

async function createOrder(uid: string, body: unknown) {
  const parsed = createOrderSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { buyNowItem, useCredit, consent } = parsed.data;

  let cartItems: { itemType: ItemType; itemId: string }[];
  let couponCode: string | null;
  // A coupon typed directly into Buy Now was never checked anywhere before
  // now, so an invalid one should fail loudly here rather than silently
  // charging full price - the cart path already validated (or self-healed)
  // its stored code before this point, so it keeps the existing quiet
  // drop-if-now-invalid behavior instead.
  const isExplicitBuyNowCoupon = !!buyNowItem;
  const fromCart = !buyNowItem;
  if (buyNowItem) {
    cartItems = [buyNowItem];
    couponCode = parsed.data.couponCode ?? null;
  } else {
    const cartSnap = await db.collection('carts').doc(uid).get();
    cartItems = (cartSnap.exists ? cartSnap.data()!.items : []) as { itemType: ItemType; itemId: string }[];
    if (cartItems.length === 0) throw Err.failedPrecondition('Your cart is empty');
    couponCode = cartSnap.exists ? (cartSnap.data()!.couponCode ?? null) : null;
  }

  // Recompute everything from the live docs - never trust the cart (or any
  // client input) as a price source for a real payment.
  const orderItems: {
    itemType: ItemType;
    itemId: string;
    title: string;
    unitPrice: number;
    certificationId: string | null;
    accessPeriodLabel: string;
  }[] = [];
  let currency: 'INR' | 'USD' = 'INR';
  for (const entry of cartItems) {
    const snap = await db.collection(collectionFor(entry.itemType)).doc(entry.itemId).get();
    if (!snap.exists) continue; // deleted since being added - silently dropped, same as api/cart.ts
    const data = snap.data()!;
    if (entry.itemType === 'package') {
      // A package never has its own purchase doc (see PackageDoc's own
      // comment) - "already owned" means every included item is already
      // owned, matching api/cart.ts's isPackageFullyOwned.
      if (await isPackageFullyOwned(uid, data)) continue;
      orderItems.push({
        itemType: 'package',
        itemId: entry.itemId,
        title: data.name,
        unitPrice: data.price ?? 0,
        certificationId: data.certificationId ?? null,
        accessPeriodLabel: accessPeriodLabelFor(data.accessValidityDays),
      });
    } else {
      const purchaseSnap = await db.collection('purchases').doc(`${uid}_${entry.itemType}_${entry.itemId}`).get();
      if (purchaseSnap.exists) continue; // already owned - don't charge twice
      orderItems.push({
        itemType: entry.itemType,
        itemId: entry.itemId,
        title: data.title,
        unitPrice: data.price ?? 0,
        // A direct quiz / practice-test purchase has no stored link to a
        // certification (only packages carry certificationId) - recorded null.
        certificationId: null,
        accessPeriodLabel: accessPeriodLabelFor(data.accessPeriodDays),
      });
    }
    currency = data.currency ?? 'INR'; // api/cart.ts's addItem guarantees every item in a cart shares one currency
  }
  if (orderItems.length === 0) throw Err.failedPrecondition('Nothing left to check out: everything in your cart was already purchased');

  const subtotal = orderItems.reduce((sum, i) => sum + i.unitPrice, 0);
  let discount = 0;
  let appliedCoupon: string | null = null;
  if (couponCode) {
    const coupon = await validateCoupon(couponCode, uid);
    if (coupon) {
      discount = computeDiscount(coupon, subtotal);
      appliedCoupon = couponCode;
    } else if (isExplicitBuyNowCoupon) {
      throw Err.invalidArgument('This coupon code is invalid or has expired');
    }
  }

  // Refer & Earn credit - a separate, stackable discount on top of any
  // coupon above, capped at admin-configured % of the subtotal.
  const credit = await applyMyCredit(uid, subtotal, useCredit);
  discount += credit.appliedMinor;

  const total = subtotal - discount;
  if (total <= 0) throw Err.failedPrecondition('Order total must be greater than zero');

  const { keyId, keySecret } = getRazorpayCreds();
  const orderRef = db.collection('orders').doc();

  const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
    },
    body: JSON.stringify({ amount: total, currency, receipt: orderRef.id }),
  });
  if (!rzpRes.ok) {
    const errBody = await rzpRes.text();
    console.error('Razorpay order creation failed:', rzpRes.status, errBody);
    // Most common cause of a currency-specific failure here: the Razorpay
    // account doesn't have international payments enabled yet, so a USD
    // order is rejected even though the request itself is well-formed.
    throw new Error(
      currency === 'USD'
        ? 'Could not create the payment order. This account may not have USD/international payments enabled yet.'
        : 'Could not create the payment order. Please try again.'
    );
  }
  const rzpOrder = (await rzpRes.json()) as { id: string };

  const consentRecord = {
    correctProduct: consent.correctProduct,
    previewAcknowledged: consent.previewAcknowledged,
    policiesAccepted: consent.policiesAccepted,
    technicalPolicyAcknowledged: consent.technicalPolicyAcknowledged,
    acceptedAt: consent.acceptedAt,
  };

  await orderRef.set({
    userId: uid,
    items: orderItems,
    couponCode: appliedCoupon,
    creditAppliedMinor: credit.appliedMinor,
    creditEntryIdsUsed: credit.entryIdsUsed,
    subtotal,
    discount,
    total,
    currency,
    razorpayOrderId: rzpOrder.id,
    razorpayPaymentId: null,
    status: 'created',
    refundedAt: null,
    refundReason: null,
    fromCart,
    consent: consentRecord,
    policyVersions: POLICY_VERSIONS,
    createdAt: Timestamp.now(),
    paidAt: null,
  });

  // Immutable purchase-consent record - a separate write-once doc (id =
  // order id) so a later price/policy/product change can never rewrite what
  // this customer was shown and agreed to. finalizeOrder patches in the
  // razorpayPaymentId/paidAt once; nothing else ever touches it.
  await db.collection('purchaseConsents').doc(orderRef.id).set({
    userId: uid,
    orderId: orderRef.id,
    razorpayOrderId: rzpOrder.id,
    razorpayPaymentId: null,
    currency,
    subtotal,
    discount,
    total,
    items: orderItems.map((i) => ({
      itemType: i.itemType,
      itemId: i.itemId,
      certificationId: i.certificationId,
      displayedName: i.title,
      displayedPrice: i.unitPrice,
      accessPeriodLabel: i.accessPeriodLabel,
    })),
    consent: consentRecord,
    policyVersions: POLICY_VERSIONS,
    consentRecordedAt: Timestamp.now(),
    paidAt: null,
  });

  // Only now that the order itself is confirmed created - a failed
  // Razorpay call above must never leave credit half-consumed with no
  // order to show for it.
  credit.writes();

  return { orderId: orderRef.id, razorpayOrderId: rzpOrder.id, amount: total, currency, keyId };
}

// Refer & Earn - the referrer's reward is real HelpCertify credit (not a
// coupon): non-withdrawable, always a flat money amount (a percentage
// doesn't make sense for a standing balance not tied to one specific
// purchase at grant time - that's the referee's coupon instead), spendable
// across future purchases up to a percentage cap (see applyMyCredit),
// only becomes spendable after a validation/holding period, and can be
// clawed back on refund (see api/admin.ts's refundOrder). Granted only
// once the referee's first *eligible* order is actually paid (never on
// signup alone - see ReferralDoc). Amount/validation-period/expiry/
// eligible-items/monthly-limit are all admin-configurable (see
// api/admin.ts's getAppSettings/updateAppSettings); the defaults below are
// only the fallback for a doc that predates that control. Duplicated in
// api/razorpay-webhook.ts's own finalizeOrder, same no-shared-code
// convention as everything else here.
const REFERRAL_CREDIT_AMOUNT_DEFAULT_MINOR = 25000; // ₹250, in paise
const REFERRAL_VALIDATION_DAYS_DEFAULT = 7;
const REFERRAL_CREDIT_EXPIRY_DAYS_DEFAULT = 90;
const REFERRAL_MONTHLY_LIMIT_DEFAULT = 10;

// Renamed from the old grantReferralRewardIfEligible - now creates a
// credit ledger entry instead of minting a coupon, and folds in the
// eligible-items check, monthly cap, and the doc-id-is-the-order-id
// idempotency guarantee (see CreditLedgerEntryDoc's own comment).
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
    batch.update(referralRef, { status: 'rejected', rejectionReason: "Referrer's monthly referral reward limit reached", qualifyingOrderId: orderId });
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

// Shared by both the client-verify path (here) and the webhook - kept as a
// small duplicated function rather than an import, per this project's
// no-shared-code-across-api/*.ts convention. Idempotent: safe to call twice
// for the same order (e.g. both the client callback and the webhook land)
// since it no-ops once status is already 'paid'.
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

  await ref.update({ status: 'paid', razorpayPaymentId, paidAt: Timestamp.now() });

  for (const item of order.items as { itemType: ItemType; itemId: string }[]) {
    if (item.itemType === 'package') {
      // A package doesn't get its own purchase doc - it fans out to one
      // purchase doc per included item, the exact same shape an individual
      // purchase would create, so every existing entitlement gate
      // (api/quiz-session.ts, api/practice-session.ts) and every student
      // page's owned-item check keeps working unmodified. See PackageDoc's
      // own comment in src/types/models.ts.
      const pkgSnap = await db.collection('packages').doc(item.itemId).get();
      const pkgData = pkgSnap.data();
      if (!pkgData) continue; // package deleted between order creation and payment - nothing to grant
      const includedQuizIds: string[] = pkgData.includedQuizIds ?? [];
      const includedPracticeTestIds: string[] = pkgData.includedPracticeTestIds ?? [];
      for (const quizId of includedQuizIds) {
        batch.set(db.collection('purchases').doc(`${order.userId}_quiz_${quizId}`), {
          userId: order.userId,
          itemType: 'quiz',
          itemId: quizId,
          orderId,
          purchasedAt: Timestamp.now(),
          sourcePackageId: item.itemId,
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
    batch.update(db.collection('coupons').doc(order.couponCode), { usedCount: FieldValue.increment(1) });
  }
  // Only clear the cart for an order that actually came from it - a Buy Now
  // order (fromCart: false) must never wipe out unrelated items the
  // student still has sitting in their cart.
  if (order.fromCart) {
    batch.set(db.collection('carts').doc(order.userId), { items: [], couponCode: null, updatedAt: Timestamp.now() }, { merge: true });
  }
  await batch.commit();

  // Patch the payment id onto the immutable consent record (one-time; the
  // record is otherwise never modified). Best-effort - an order that
  // predates purchaseConsents simply has no doc here.
  await db
    .collection('purchaseConsents')
    .doc(orderId)
    .set({ razorpayPaymentId, paidAt: Timestamp.now() }, { merge: true })
    .catch((e) => console.error('purchaseConsents paidAt patch failed:', orderId, e));

  return 'paid';
}

const verifyPaymentSchema = z.object({
  orderId: z.string().min(1),
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

async function verifyPayment(uid: string, body: unknown) {
  const parsed = verifyPaymentSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = parsed.data;

  const ref = db.collection('orders').doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) throw Err.notFound('Order not found');
  const order = snap.data()!;
  if (order.userId !== uid) throw Err.notFound('Order not found');
  if (order.razorpayOrderId !== razorpay_order_id) throw Err.invalidArgument('Order mismatch');

  const { keySecret } = getRazorpayCreds();
  const expected = createHmac('sha256', keySecret).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(razorpay_signature);
  const valid = expectedBuf.length === actualBuf.length && timingSafeEqual(expectedBuf, actualBuf);
  if (!valid) throw Err.invalidArgument('Payment signature could not be verified');

  await finalizeOrder(orderId, razorpay_payment_id);
  return { success: true };
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const { action, ...data } = (req.body ?? {}) as { action?: string; [key: string]: unknown };
    const { uid } = await requireStudent(req);

    switch (action) {
      case 'createOrder':
        res.status(200).json(await createOrder(uid, data));
        return;
      case 'verifyPayment':
        res.status(200).json(await verifyPayment(uid, data));
        return;
      default:
        throw Err.invalidArgument(`Unknown action: ${String(action)}`);
    }
  } catch (err) {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message, details: err.details });
      return;
    }
    console.error('checkout handler error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
}
