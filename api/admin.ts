import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';

// New file for the v2 (Quiz + Practice Test) platform — different actions
// than functions/src/_migrated-v1-reference/admin.ts (which was
// user-management for the old course/certificate product). Self-contained —
// see api/auth.ts's header comment for why (no shared code across api/*.ts).

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
  permissionDenied: (m = 'You do not have permission to perform this action') => new HttpError(403, m),
  invalidArgument: (m: string, details?: unknown) => new HttpError(422, m, details),
  conflict: (m: string) => new HttpError(409, m),
};

async function requireAdmin(req: VercelRequest): Promise<{ uid: string }> {
  const authHeader = req.headers.authorization ?? '';
  const token = (Array.isArray(authHeader) ? authHeader[0] : authHeader).replace(/^Bearer\s+/i, '');
  if (!token) throw Err.unauthenticated();

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch {
    throw Err.unauthenticated('Invalid or expired token');
  }

  // Role comes from the Firestore users/{uid} doc, not an ID-token custom
  // claim — this is what lets an admin be created (or promoted) entirely
  // from the Firebase Console (Auth: add user: Firestore: set role:'admin'
  // on their users/{uid} doc), no Admin SDK script required.
  const snap = await db.collection('users').doc(decoded.uid).get();
  const user = snap.data();
  if (!snap.exists || !user?.isActive) throw Err.unauthenticated('Account not found or deactivated');
  if (user.role !== 'admin') throw Err.permissionDenied();

  return { uid: decoded.uid };
}

async function writeAdminLog(args: {
  performedBy: string;
  action: string;
  targetType: string;
  targetId: string;
  description: string;
  severity?: 'info' | 'warning' | 'critical';
}) {
  await db.collection('adminLogs').add({
    performedBy: args.performedBy,
    action: args.action,
    targetType: args.targetType,
    targetId: args.targetId,
    description: args.description,
    severity: args.severity ?? 'info',
    createdAt: FieldValue.serverTimestamp(),
  });
}

async function getDashboardStats() {
  const [quizzesCount, practiceTestsCount, attemptsCount, adminAccountsSnap] = await Promise.all([
    db.collection('quizzes').count().get(),
    db.collection('practiceTests').count().get(),
    db.collection('quizAttempts').count().get(),
    db.collection('users').where('role', '==', 'admin').count().get(),
  ]);

  return {
    totalQuizzes: quizzesCount.data().count,
    totalPracticeTests: practiceTestsCount.data().count,
    studentAttempts: attemptsCount.data().count,
    adminAccounts: adminAccountsSnap.data().count,
  };
}

const createAdminSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
});

async function createAdminAccount(uid: string, body: unknown) {
  const parsed = createAdminSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { name, email, password } = parsed.data;

  let newUid: string;
  try {
    const userRecord = await adminAuth.createUser({ email, password, displayName: name });
    newUid = userRecord.uid;
  } catch (err) {
    if ((err as { code?: string }).code === 'auth/email-already-exists') {
      throw Err.conflict('An account with this email already exists');
    }
    throw err;
  }

  const now = FieldValue.serverTimestamp();
  await db.collection('users').doc(newUid).set({
    name,
    email,
    role: 'admin',
    avatarUrl: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  await writeAdminLog({
    performedBy: uid,
    action: 'createAdminAccount',
    targetType: 'user',
    targetId: newUid,
    description: `Created admin account for ${email}`,
  });

  return { uid: newUid };
}

async function listAdminAccounts() {
  const snap = await db.collection('users').where('role', '==', 'admin').get();
  return {
    accounts: snap.docs.map((d) => ({ id: d.id, name: d.data().name, email: d.data().email, isActive: d.data().isActive })),
  };
}

async function listAdminLogs() {
  const snap = await db.collection('adminLogs').orderBy('createdAt', 'desc').limit(100).get();
  return { logs: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
}

// --- App settings (Email/Mobile OTP toggles, Refer & Earn rewards) -----
// A single appSettings/general doc rather than one doc per setting — a
// single doc keeps getAppSettings/updateAppSettings a plain get/set
// instead of a query.

// Refer & Earn — defaults match what's hardcoded in api/auth.ts's
// linkReferral (referee coupon) and api/checkout.ts's/
// api/razorpay-webhook.ts's processReferralOnPurchase (referrer credit),
// applied whenever appSettings/general doesn't have these fields yet
// (every doc that predates this admin control) so behavior doesn't
// silently change for anyone until an admin actually saves new values.
// The referrer's reward is always a flat credit amount now (not a
// coupon, so no percent option — see CreditLedgerEntryDoc); the referee's
// stays a coupon (flat or percent, default 10% per the current spec).
const REFERRAL_DEFAULTS = {
  referralCreditAmountMinor: 25000, // ₹250, in paise
  referralValidationPeriodDays: 7,
  referralCreditExpiryDays: 90,
  referralMonthlyLimit: 10,
  referralCreditMaxPercent: 25,
  referralEligibleItemIds: [] as string[], // empty = every paid item is eligible
  refereeRewardType: 'percent' as const,
  refereeRewardValue: 10,
};

async function getAppSettings() {
  const snap = await db.collection('appSettings').doc('general').get();
  const data = snap.data();
  return {
    emailOtpEnabled: data?.emailOtpEnabled === true,
    // Always false in the response regardless of what's stored — there's
    // no SMS provider wired up yet (see updateAppSettings), so this can
    // never actually be true no matter what a stale doc might say.
    mobileOtpEnabled: false,
    referralCreditAmountMinor: data?.referralCreditAmountMinor ?? REFERRAL_DEFAULTS.referralCreditAmountMinor,
    referralValidationPeriodDays: data?.referralValidationPeriodDays ?? REFERRAL_DEFAULTS.referralValidationPeriodDays,
    referralCreditExpiryDays: data?.referralCreditExpiryDays ?? REFERRAL_DEFAULTS.referralCreditExpiryDays,
    referralMonthlyLimit: data?.referralMonthlyLimit ?? REFERRAL_DEFAULTS.referralMonthlyLimit,
    referralCreditMaxPercent: data?.referralCreditMaxPercent ?? REFERRAL_DEFAULTS.referralCreditMaxPercent,
    referralEligibleItemIds: data?.referralEligibleItemIds ?? REFERRAL_DEFAULTS.referralEligibleItemIds,
    refereeRewardType: data?.refereeRewardType ?? REFERRAL_DEFAULTS.refereeRewardType,
    refereeRewardValue: data?.refereeRewardValue ?? REFERRAL_DEFAULTS.refereeRewardValue,
  };
}

// discountValue: flat is paise (same convention as CouponDoc/createCoupon);
// percent is capped at 95 — same reasoning as api/coupons.ts's own cap (a
// 100% coupon would zero out the order Razorpay needs a positive amount for).
const refereeRewardSchema = z
  .object({
    type: z.enum(['flat', 'percent']),
    value: z.number().int().min(1),
  })
  .refine((r) => r.type !== 'percent' || r.value <= 95, {
    message: 'Percent rewards are capped at 95%',
  });

const updateAppSettingsSchema = z.object({
  emailOtpEnabled: z.boolean(),
  // Accepted but ignored below — mobile OTP has no SMS provider wired up
  // yet, so this can't actually be turned on. Still typed/validated here
  // (rather than omitted) so the Settings page's checkbox has somewhere
  // real to send its value once a provider is added.
  mobileOtpEnabled: z.boolean(),
  referralCreditAmountMinor: z.number().int().min(1),
  referralValidationPeriodDays: z.number().int().min(0).max(365),
  referralCreditExpiryDays: z.number().int().min(1).max(3650),
  referralMonthlyLimit: z.number().int().min(1).max(10000),
  referralCreditMaxPercent: z.number().int().min(1).max(100),
  referralEligibleItemIds: z.array(z.string()).default([]),
  refereeReward: refereeRewardSchema,
});

async function updateAppSettings(uid: string, body: unknown) {
  const parsed = updateAppSettingsSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const d = parsed.data;

  await db.collection('appSettings').doc('general').set(
    {
      emailOtpEnabled: d.emailOtpEnabled,
      mobileOtpEnabled: false,
      referralCreditAmountMinor: d.referralCreditAmountMinor,
      referralValidationPeriodDays: d.referralValidationPeriodDays,
      referralCreditExpiryDays: d.referralCreditExpiryDays,
      referralMonthlyLimit: d.referralMonthlyLimit,
      referralCreditMaxPercent: d.referralCreditMaxPercent,
      referralEligibleItemIds: d.referralEligibleItemIds,
      refereeRewardType: d.refereeReward.type,
      refereeRewardValue: d.refereeReward.value,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await writeAdminLog({
    performedBy: uid,
    action: 'updateAppSettings',
    targetType: 'appSettings',
    targetId: 'general',
    description: `Set email OTP verification to ${d.emailOtpEnabled ? 'on' : 'off'}; referrer credit ₹${d.referralCreditAmountMinor / 100} (${d.referralValidationPeriodDays}d validation, ${d.referralCreditExpiryDays}d expiry, max ${d.referralMonthlyLimit}/month, up to ${d.referralCreditMaxPercent}% of a purchase); referee reward ${d.refereeReward.type === 'flat' ? `₹${d.refereeReward.value / 100}` : `${d.refereeReward.value}%`}`,
  });

  return { success: true };
}

// --- Company / contact details (appSettings/company) ---------------------
// Admin-editable overrides for the public contact facts shown on the
// marketing/legal pages and checkout consent links. Stored in its own doc
// (publicly readable — see firestore.rules) so the marketing SPA can read
// it without auth. The frontend keeps the compile-time defaults in
// src/features/marketing/companyInfo.ts and merges a stored value only when
// it's a non-blank string, so an empty field here just falls back.
const COMPANY_FIELD_KEYS = [
  'operatorName',
  'operatorType',
  'operatorCountry',
  'registeredAddress',
  'jurisdiction',
  'contactEmail',
  'contactPhone',
  'grievanceEmail',
  'grievanceOfficer',
] as const;

async function getCompanyInfo() {
  const snap = await db.collection('appSettings').doc('company').get();
  const data = snap.data() ?? {};
  const out: Record<string, string> = {};
  for (const key of COMPANY_FIELD_KEYS) out[key] = typeof data[key] === 'string' ? data[key] : '';
  return out;
}

const updateCompanyInfoSchema = z.object({
  operatorName: z.string().trim().max(200).optional().default(''),
  operatorType: z.string().trim().max(200).optional().default(''),
  operatorCountry: z.string().trim().max(100).optional().default(''),
  registeredAddress: z.string().trim().max(500).optional().default(''),
  jurisdiction: z.string().trim().max(200).optional().default(''),
  contactEmail: z.union([z.string().trim().email(), z.literal('')]).optional().default(''),
  contactPhone: z.string().trim().max(40).optional().default(''),
  grievanceEmail: z.union([z.string().trim().email(), z.literal('')]).optional().default(''),
  grievanceOfficer: z.string().trim().max(200).optional().default(''),
});

async function updateCompanyInfo(uid: string, body: unknown) {
  const parsed = updateCompanyInfoSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const d = parsed.data;

  await db.collection('appSettings').doc('company').set(
    { ...d, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );

  await writeAdminLog({
    performedBy: uid,
    action: 'updateCompanyInfo',
    targetType: 'appSettings',
    targetId: 'company',
    description: `Updated company / contact details (entity "${d.operatorName || '—'}", contact ${d.contactEmail || '—'}, phone ${d.contactPhone || '—'})`,
  });

  return { success: true };
}

// --- Users list (Learner Analytics' "Users" tab) ------------------------
// One read of every user doc plus one read of every purchase doc, joined
// in memory by userId — simpler than N per-user count queries, and fine
// at this app's current scale (see this file's header comment: no shared
// helpers across api/*.ts, so this pattern is duplicated rather than
// imported wherever a listing needs a purchase count per user).

async function listUsersAdmin() {
  const [usersSnap, purchasesSnap] = await Promise.all([
    db.collection('users').orderBy('createdAt', 'desc').get(),
    db.collection('purchases').get(),
  ]);

  const purchaseCountByUser = new Map<string, number>();
  for (const doc of purchasesSnap.docs) {
    const userId = doc.data().userId as string;
    purchaseCountByUser.set(userId, (purchaseCountByUser.get(userId) ?? 0) + 1);
  }

  return {
    users: usersSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        name: data.name as string,
        email: data.email as string,
        role: data.role as string,
        isActive: data.isActive as boolean,
        // Missing entirely = registered before this feature existed, or
        // OTP was off at the time — never actually blocked, so treated as
        // verified rather than shown as a false alarm.
        emailVerified: data.emailVerified !== false,
        createdAt: data.createdAt,
        purchaseCount: purchaseCountByUser.get(d.id) ?? 0,
      };
    }),
  };
}

const userDetailSchema = z.object({ uid: z.string().min(1) });

async function getUserDetailAdmin(body: unknown) {
  const parsed = userDetailSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);

  const [userSnap, ordersSnap] = await Promise.all([
    db.collection('users').doc(parsed.data.uid).get(),
    // Two equality filters (userId, status) — no orderBy on a third field,
    // so this doesn't need a composite index. Sorted in memory instead,
    // fine at the per-user order volumes this app has.
    db.collection('orders').where('userId', '==', parsed.data.uid).where('status', '==', 'paid').get(),
  ]);
  if (!userSnap.exists) throw Err.invalidArgument('User not found');

  const orders = ordersSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as { id: string; createdAt?: { toMillis(): number } })
    .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));

  return {
    user: { id: userSnap.id, ...userSnap.data() },
    orders,
  };
}

function getRazorpayCreds() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error('Razorpay env vars are not configured');
  return { keyId, keySecret };
}

const refundOrderSchema = z.object({ orderId: z.string().min(1), reason: z.string().trim().min(1).max(500) });

// Item 11 — refunds an order via Razorpay's own refund API, then reverses
// any referral benefit tied to it: mirrors
// src/features/students/lib/referralRules.ts's nextStatusOnRefund (that
// module is the tested, canonical version; duplicated inline here since
// api/*.ts files can't import across each other or from src/). An
// already-spent portion of a clawed-back credit entry (spent on a
// *different* purchase before this refund happened) is not itself clawed
// back — a deliberate simplification, not an oversight.
async function refundOrder(uid: string, body: unknown) {
  const parsed = refundOrderSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { orderId, reason } = parsed.data;

  const orderRef = db.collection('orders').doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) throw Err.invalidArgument('Order not found');
  const order = orderSnap.data()!;
  if (order.status !== 'paid') throw Err.conflict(`Only a paid order can be refunded (this one is "${order.status}")`);

  const { keyId, keySecret } = getRazorpayCreds();
  const rzpRes = await fetch(`https://api.razorpay.com/v1/payments/${order.razorpayPaymentId}/refund`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
    },
    body: JSON.stringify({}),
  });
  if (!rzpRes.ok) {
    const errBody = await rzpRes.text();
    console.error('Razorpay refund failed:', rzpRes.status, errBody);
    throw new Error('Could not process the refund with Razorpay. Please try again.');
  }

  const batch = db.batch();
  batch.update(orderRef, { status: 'refunded', refundedAt: Timestamp.now(), refundReason: reason });

  // Reverse a referral benefit tied to this order, if this was the
  // referee's own qualifying purchase (a referrer's credit was granted,
  // or about to be) — nextStatusOnRefund only reverses 'pending'/
  // 'rewarded', leaving every other status (already rejected/reversed/
  // expired, or one that never reached a reward at all) untouched.
  const referralsSnap = await db.collection('referrals').where('qualifyingOrderId', '==', orderId).limit(1).get();
  if (!referralsSnap.empty) {
    const referralDoc = referralsSnap.docs[0];
    const referral = referralDoc.data();
    if (referral.status === 'pending' || referral.status === 'rewarded') {
      batch.update(referralDoc.ref, { status: 'reversed', rejectionReason: `Order ${orderId} was refunded` });
      if (referral.creditEntryId) {
        batch.update(db.collection('creditLedgerEntries').doc(referral.creditEntryId), {
          status: 'reversed',
          remainingMinor: 0,
          reversedAt: Timestamp.now(),
          reversalReason: `Order ${orderId} was refunded`,
        });
      }
    }
  }

  await batch.commit();

  await writeAdminLog({
    performedBy: uid,
    action: 'refundOrder',
    targetType: 'order',
    targetId: orderId,
    description: `Refunded order ${orderId} (${reason})`,
  });

  return { success: true };
}

// Item 15 — the Referral Audit admin page. referrer/referee names+emails
// are fine to expose here (admin-only); contrast with item 16, which
// keeps the *learner-facing* referral list free of the other party's PII
// (see ReferAndEarnSection.tsx).
async function listReferralsAdmin() {
  const [referralsSnap, usersSnap] = await Promise.all([
    db.collection('referrals').orderBy('createdAt', 'desc').limit(200).get(),
    db.collection('users').get(),
  ]);
  const userById = new Map(usersSnap.docs.map((d) => [d.id, d.data()]));

  return {
    referrals: referralsSnap.docs.map((d) => {
      const r = d.data();
      const referrer = userById.get(r.referrerUid as string);
      return {
        id: d.id,
        referrerName: (referrer?.name as string | undefined) ?? 'Unknown',
        referrerEmail: (referrer?.email as string | undefined) ?? '',
        refereeName: r.refereeName as string,
        refereeUid: r.refereeUid as string,
        status: r.status as string,
        rejectionReason: (r.rejectionReason as string | null) ?? null,
        qualifyingOrderId: (r.qualifyingOrderId as string | null) ?? null,
        creditEntryId: (r.creditEntryId as string | null) ?? null,
        createdAt: r.createdAt,
        rewardedAt: r.rewardedAt ?? null,
      };
    }),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { action, ...data } = (req.body ?? {}) as { action?: string; [key: string]: unknown };
    const { uid } = await requireAdmin(req);

    switch (action) {
      case 'getDashboardStats':
        res.status(200).json(await getDashboardStats());
        return;
      case 'createAdminAccount':
        res.status(200).json(await createAdminAccount(uid, data));
        return;
      case 'listAdminAccounts':
        res.status(200).json(await listAdminAccounts());
        return;
      case 'listAdminLogs':
        res.status(200).json(await listAdminLogs());
        return;
      case 'getAppSettings':
        res.status(200).json(await getAppSettings());
        return;
      case 'updateAppSettings':
        res.status(200).json(await updateAppSettings(uid, data));
        return;
      case 'getCompanyInfo':
        res.status(200).json(await getCompanyInfo());
        return;
      case 'updateCompanyInfo':
        res.status(200).json(await updateCompanyInfo(uid, data));
        return;
      case 'listUsersAdmin':
        res.status(200).json(await listUsersAdmin());
        return;
      case 'getUserDetailAdmin':
        res.status(200).json(await getUserDetailAdmin(data));
        return;
      case 'refundOrder':
        res.status(200).json(await refundOrder(uid, data));
        return;
      case 'listReferralsAdmin':
        res.status(200).json(await listReferralsAdmin());
        return;
      default:
        throw Err.invalidArgument(`Unknown action: ${String(action)}`);
    }
  } catch (err) {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message, details: err.details });
      return;
    }
    console.error('admin handler error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
}
