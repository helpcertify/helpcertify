import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { randomBytes, createHash } from 'node:crypto';
import { z } from 'zod';

// New file for the v2 (Quiz + Practice Test) platform - different actions
// than functions/src/_migrated-v1-reference/admin.ts (which was
// user-management for the old course/certificate product). Self-contained -
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

async function requireAdmin(req: VercelRequest): Promise<{ uid: string; role: 'admin' | 'finance_admin' }> {
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
  // claim - this is what lets an admin be created (or promoted) entirely
  // from the Firebase Console (Auth: add user: Firestore: set role:'admin'
  // on their users/{uid} doc), no Admin SDK script required.
  const snap = await db.collection('users').doc(decoded.uid).get();
  const user = snap.data();
  if (!snap.exists || !user?.isActive) throw Err.unauthenticated('Account not found or deactivated');
  // finance_admin is a limited staff role: it may only reach the payout /
  // commission finance actions (see FINANCE_ADMIN_ACTIONS in the handler).
  // Everything else stays admin-only.
  if (user.role !== 'admin' && user.role !== 'finance_admin') throw Err.permissionDenied();

  return { uid: decoded.uid, role: user.role as 'admin' | 'finance_admin' };
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

// --- Trainer / Mentored Learning, Phase 1A -------------------------------
// Deliberately no application/KYC flow (unlike Partner above) - an admin
// grants this directly on an existing user's account. See
// src/types/models.ts's TrainerDoc for why this is a capability layered on
// a student account, not a new Role.
const grantTrainerStatusSchema = z.object({ userId: z.string().trim().min(1) });

async function grantTrainerStatus(uid: string, body: unknown) {
  const parsed = grantTrainerStatusSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { userId } = parsed.data;

  const userRef = db.collection('users').doc(userId);
  const userSnap = await userRef.get();
  if (!userSnap.exists) throw Err.invalidArgument('User not found');
  const user = userSnap.data()!;

  const now = FieldValue.serverTimestamp();
  const existingTrainerId = user.trainerId as string | undefined;

  if (existingTrainerId) {
    // Re-granting after a revoke - reactivate the existing trainers/{id}
    // doc instead of minting a second one, so past training programs
    // (owned by that same trainerId) come back with it.
    await db.collection('trainers').doc(existingTrainerId).update({ status: 'ACTIVE' });
    await writeAdminLog({
      performedBy: uid,
      action: 'grantTrainerStatus',
      targetType: 'trainer',
      targetId: existingTrainerId,
      description: `Reactivated trainer status for ${user.email ?? userId}`,
    });
    return { trainerId: existingTrainerId };
  }

  const trainerRef = db.collection('trainers').doc();
  await trainerRef.set({
    linkedUserId: userId,
    displayName: (user.name as string) ?? 'Trainer',
    status: 'ACTIVE',
    createdBy: uid,
    createdAt: now,
  });
  await userRef.update({ trainerId: trainerRef.id, updatedAt: now });

  await writeAdminLog({
    performedBy: uid,
    action: 'grantTrainerStatus',
    targetType: 'trainer',
    targetId: trainerRef.id,
    description: `Granted trainer status to ${user.email ?? userId}`,
  });

  return { trainerId: trainerRef.id };
}

const revokeTrainerStatusSchema = z.object({ userId: z.string().trim().min(1) });

async function revokeTrainerStatus(uid: string, body: unknown) {
  const parsed = revokeTrainerStatusSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { userId } = parsed.data;

  const userSnap = await db.collection('users').doc(userId).get();
  const trainerId = userSnap.data()?.trainerId as string | undefined;
  if (!trainerId) throw Err.invalidArgument('This user is not a trainer');

  // Soft revoke - the trainers/{id} doc and every program it owns stay
  // intact, they're just no longer reachable by that user (their own
  // requireActiveTrainer check in api/content-admin.ts fails once
  // status !== 'ACTIVE'). users/{uid}.trainerId is left set so re-granting
  // finds the same trainerId again (see grantTrainerStatus above).
  await db.collection('trainers').doc(trainerId).update({ status: 'SUSPENDED' });

  await writeAdminLog({
    performedBy: uid,
    action: 'revokeTrainerStatus',
    targetType: 'trainer',
    targetId: trainerId,
    description: `Revoked trainer status for ${userSnap.data()?.email ?? userId}`,
  });

  return { success: true };
}

async function listTrainersAdmin() {
  const snap = await db.collection('trainers').orderBy('createdAt', 'desc').get();
  return { trainers: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
}

// --- App settings (Email/Mobile OTP toggles, Refer & Earn rewards) -----
// A single appSettings/general doc rather than one doc per setting - a
// single doc keeps getAppSettings/updateAppSettings a plain get/set
// instead of a query.

// Refer & Earn - defaults match what's hardcoded in api/auth.ts's
// linkReferral (referee coupon) and api/checkout.ts's/
// api/razorpay-webhook.ts's processReferralOnPurchase (referrer credit),
// applied whenever appSettings/general doesn't have these fields yet
// (every doc that predates this admin control) so behavior doesn't
// silently change for anyone until an admin actually saves new values.
// The referrer's reward is always a flat credit amount now (not a
// coupon, so no percent option - see CreditLedgerEntryDoc); the referee's
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
  const [snap, appearanceSnap] = await Promise.all([
    db.collection('appSettings').doc('general').get(),
    db.collection('appSettings').doc('appearance').get(),
  ]);
  const data = snap.data();
  return {
    emailOtpEnabled: data?.emailOtpEnabled === true,
    // Global dark-mode feature flag. Kept on its own publicly-readable doc
    // (appSettings/appearance) so the SPA can read it without an admin
    // call - see src/features/appearance/loadAppearance.ts.
    darkModeEnabled: appearanceSnap.data()?.darkModeEnabled === true,
    // Always false in the response regardless of what's stored - there's
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
// percent is capped at 95 - same reasoning as api/coupons.ts's own cap (a
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
  // Global dark-mode feature flag - persisted to appSettings/appearance.
  darkModeEnabled: z.boolean(),
  // Accepted but ignored below - mobile OTP has no SMS provider wired up
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

  // Dark-mode flag lives on its own publicly-readable doc so the SPA can
  // read it without an admin call.
  await db.collection('appSettings').doc('appearance').set(
    { darkModeEnabled: d.darkModeEnabled, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );

  await writeAdminLog({
    performedBy: uid,
    action: 'updateAppSettings',
    targetType: 'appSettings',
    targetId: 'general',
    description: `Set email OTP verification to ${d.emailOtpEnabled ? 'on' : 'off'}; dark mode ${d.darkModeEnabled ? 'enabled' : 'disabled'}; referrer credit ₹${d.referralCreditAmountMinor / 100} (${d.referralValidationPeriodDays}d validation, ${d.referralCreditExpiryDays}d expiry, max ${d.referralMonthlyLimit}/month, up to ${d.referralCreditMaxPercent}% of a purchase); referee reward ${d.refereeReward.type === 'flat' ? `₹${d.refereeReward.value / 100}` : `${d.refereeReward.value}%`}`,
  });

  return { success: true };
}

// --- Company / contact details (appSettings/company) ---------------------
// Admin-editable overrides for the public contact facts shown on the
// marketing/legal pages and checkout consent links. Stored in its own doc
// (publicly readable - see firestore.rules) so the marketing SPA can read
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
  'grievanceOfficerTitle',
  'gstin',
  'udyamNumber',
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
  grievanceOfficerTitle: z.string().trim().max(200).optional().default(''),
  gstin: z.string().trim().max(20).optional().default(''),
  udyamNumber: z.string().trim().max(30).optional().default(''),
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
    description: `Updated company / contact details (entity "${d.operatorName || '-'}", contact ${d.contactEmail || '-'}, phone ${d.contactPhone || '-'})`,
  });

  return { success: true };
}

// --- Custom Exam Builder settings (appSettings/customExamBuilder) --------
// Price and availability for the "Bring Your Own Question Bank" add-on
// (see api/checkout.ts's createOrder and api/content-admin.ts's
// createCustomExamSet). Stored in its own doc (publicly readable - see
// firestore.rules) so the student-facing page can show the live price
// without an authenticated call, same pattern as appSettings/company above.
// isEnabled is a kill switch: turning it off blocks new purchases
// immediately without a deploy, without affecting students who already
// bought it.
async function getCustomExamBuilderSettings() {
  const snap = await db.collection('appSettings').doc('customExamBuilder').get();
  const data = snap.data();
  return {
    priceMinor: typeof data?.priceMinor === 'number' ? data.priceMinor : 49900,
    // The "marketing" price shown struck through, e.g. an offer's original
    // price - never charged (same convention as QuizDoc.originalPrice in
    // src/types/models.ts). null/absent = no offer badge shown.
    originalPriceMinor: typeof data?.originalPriceMinor === 'number' ? data.originalPriceMinor : null,
    currency: data?.currency === 'USD' ? 'USD' : 'INR',
    isEnabled: data?.isEnabled !== false, // defaults to on for a doc that doesn't exist yet
  };
}

const updateCustomExamBuilderSettingsSchema = z.object({
  priceMinor: z.number().int().min(0).max(10000000),
  originalPriceMinor: z.number().int().min(0).max(10000000).nullable(),
  currency: z.enum(['INR', 'USD']),
  isEnabled: z.boolean(),
});

async function updateCustomExamBuilderSettings(uid: string, body: unknown) {
  const parsed = updateCustomExamBuilderSettingsSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const d = parsed.data;

  await db.collection('appSettings').doc('customExamBuilder').set(
    { ...d, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid },
    { merge: true }
  );

  await writeAdminLog({
    performedBy: uid,
    action: 'updateCustomExamBuilderSettings',
    targetType: 'appSettings',
    targetId: 'customExamBuilder',
    description: `Set Custom Exam Builder price to ${d.priceMinor} ${d.currency} (minor units), ${d.isEnabled ? 'enabled' : 'disabled'}`,
  });

  return { success: true };
}

// --- Feature Access (appSettings/featureAccess) ---------------------------
// A small general-purpose gate: for any registered feature key, an admin
// can turn it on/off per capability (admin/trainer/creator - the app's
// actual capability model, not the Role type) and grant or exclude
// specific user IDs regardless of capability. Server-only doc (falls under
// the appSettings/{id} catch-all in firestore.rules). This file only owns
// the CRUD; api/content-admin.ts duplicates FEATURE_KEYS/FEATURE_DEFAULTS
// and does the actual gating check (hasFeatureAccess) where the gated
// actions live - no shared code across api/*.ts files, same as everywhere
// else in this codebase.
const FEATURE_KEYS = ['ai_course_builder'] as const;
type FeatureKey = (typeof FEATURE_KEYS)[number];
const FEATURE_DEFAULTS: Record<
  FeatureKey,
  { roles: Record<'admin' | 'trainer' | 'creator', boolean>; allowUserIds: string[]; denyUserIds: string[] }
> = {
  ai_course_builder: { roles: { admin: true, trainer: true, creator: true }, allowUserIds: [], denyUserIds: [] },
};

async function getFeatureAccessConfig() {
  const snap = await db.collection('appSettings').doc('featureAccess').get();
  const stored = snap.data()?.features as
    | Record<string, { roles?: Record<string, boolean>; allowUserIds?: string[]; denyUserIds?: string[] }>
    | undefined;

  const features: Record<
    FeatureKey,
    { roles: Record<'admin' | 'trainer' | 'creator', boolean>; allowUserIds: string[]; denyUserIds: string[] }
  > = {} as never;
  for (const key of FEATURE_KEYS) {
    const defaults = FEATURE_DEFAULTS[key];
    const s = stored?.[key];
    features[key] = {
      roles: { ...defaults.roles, ...(s?.roles ?? {}) } as Record<'admin' | 'trainer' | 'creator', boolean>,
      allowUserIds: s?.allowUserIds ?? defaults.allowUserIds,
      denyUserIds: s?.denyUserIds ?? defaults.denyUserIds,
    };
  }
  return { features };
}

const featureAccessFeatureSchema = z.object({
  roles: z.object({ admin: z.boolean(), trainer: z.boolean(), creator: z.boolean() }),
  allowUserIds: z.array(z.string().trim().min(1)).max(500),
  denyUserIds: z.array(z.string().trim().min(1)).max(500),
});
const updateFeatureAccessConfigSchema = z.object({
  features: z.record(z.enum(FEATURE_KEYS), featureAccessFeatureSchema),
});

async function updateFeatureAccessConfig(uid: string, body: unknown) {
  const parsed = updateFeatureAccessConfigSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);

  await db.collection('appSettings').doc('featureAccess').set(
    { features: parsed.data.features, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );

  await writeAdminLog({
    performedBy: uid,
    action: 'updateFeatureAccessConfig',
    targetType: 'appSettings',
    targetId: 'featureAccess',
    description: `Updated feature access for: ${Object.keys(parsed.data.features).join(', ')}`,
  });

  return { success: true };
}

// --- Users list (Learner Analytics' "Users" tab) ------------------------
// One read of every user doc plus one read of every purchase doc, joined
// in memory by userId - simpler than N per-user count queries, and fine
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
        // OTP was off at the time - never actually blocked, so treated as
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
    // Two equality filters (userId, status) - no orderBy on a third field,
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

const refundOrderSchema = z.object({
  orderId: z.string().min(1),
  reason: z.string().trim().min(1).max(500),
  // Minor units (paise). Omit for a full refund of whatever is left.
  amountMinor: z.number().int().positive().optional(),
});

// PRD 11: reverse commission proportionally against the refunded amount,
// rounded half-up, clamped so cumulative reversals never exceed the gross.
function proportionalReversal(grossMinor: number, refundedMinor: number, orderTotalMinor: number, alreadyReversedMinor: number): number {
  if (orderTotalMinor <= 0 || refundedMinor <= 0 || grossMinor <= 0) return 0;
  const want = Math.floor(grossMinor * Math.min(1, refundedMinor / orderTotalMinor) + 0.5);
  return Math.min(want, Math.max(0, grossMinor - alreadyReversedMinor));
}

// Item 11 - refunds an order via Razorpay's own refund API, then reverses
// any referral benefit tied to it: mirrors
// src/features/students/lib/referralRules.ts's nextStatusOnRefund (that
// module is the tested, canonical version; duplicated inline here since
// api/*.ts files can't import across each other or from src/). An
// already-spent portion of a clawed-back credit entry (spent on a
// *different* purchase before this refund happened) is not itself clawed
// back - a deliberate simplification, not an oversight.
async function refundOrder(uid: string, body: unknown) {
  const parsed = refundOrderSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { orderId, reason, amountMinor } = parsed.data;

  const orderRef = db.collection('orders').doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) throw Err.invalidArgument('Order not found');
  const order = orderSnap.data()!;
  if (order.status !== 'paid' && order.status !== 'partially_refunded') {
    throw Err.conflict(`Only a paid order can be refunded (this one is "${order.status}")`);
  }

  const orderTotal = Number(order.total) || 0;
  const alreadyRefunded = Number(order.refundedMinor) || 0;
  const remaining = orderTotal - alreadyRefunded;
  if (remaining <= 0) throw Err.conflict('This order is already fully refunded.');
  const refundAmount = amountMinor ?? remaining;
  if (refundAmount > remaining) {
    throw Err.invalidArgument(`Refund amount exceeds the ${remaining} paise still refundable on this order.`);
  }
  const fullyRefundedNow = alreadyRefunded + refundAmount >= orderTotal;

  const { keyId, keySecret } = getRazorpayCreds();
  const rzpRes = await fetch(`https://api.razorpay.com/v1/payments/${order.razorpayPaymentId}/refund`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
    },
    // Razorpay expects paise; omitting amount = full remaining refund.
    body: JSON.stringify(fullyRefundedNow && !amountMinor ? {} : { amount: refundAmount }),
  });
  if (!rzpRes.ok) {
    const errBody = await rzpRes.text();
    console.error('Razorpay refund failed:', rzpRes.status, errBody);
    throw new Error('Could not process the refund with Razorpay. Please try again.');
  }

  const batch = db.batch();
  batch.update(orderRef, {
    status: fullyRefundedNow ? 'refunded' : 'partially_refunded',
    refundedMinor: alreadyRefunded + refundAmount,
    refundedAt: Timestamp.now(),
    refundReason: reason,
  });

  // Reverse a referral benefit tied to this order, if this was the
  // referee's own qualifying purchase (a referrer's credit was granted,
  // or about to be) - nextStatusOnRefund only reverses 'pending'/
  // 'rewarded', leaving every other status (already rejected/reversed/
  // expired, or one that never reached a reward at all) untouched.
  // Learner Refer & Earn credit is reversed all-or-nothing, and only once
  // the order is fully refunded - a partial refund leaves it intact.
  const referralsSnap = fullyRefundedNow
    ? await db.collection('referrals').where('qualifyingOrderId', '==', orderId).limit(1).get()
    : { empty: true, docs: [] as FirebaseFirestore.QueryDocumentSnapshot[] };
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

  // Reverse the partner commission proportionally to this refund (PRD 11).
  // Tested spec: src/features/partner/lib/commission.ts proportionalReversalMinor.
  const commissionSnap = await db.collection('commissions').doc(orderId).get();
  if (commissionSnap.exists) {
    const c = commissionSnap.data()!;
    const cur = c.status as string;
    const gross = Number(c.grossCommissionMinor) || 0;
    const alreadyReversed = Number(c.reversedMinor) || 0;
    const reverseMinor = proportionalReversal(gross, refundAmount, orderTotal, alreadyReversed);

    if (reverseMinor > 0 && !['REVERSED', 'REJECTED'].includes(cur)) {
      const totalReversed = alreadyReversed + reverseMinor;
      const fullyReversed = totalReversed >= gross;
      const paidOut = ['PROCESSING', 'PAID'].includes(cur);

      if (paidOut) {
        // History is preserved - the paid commission stays PAID; a negative
        // RECOVERABLE row offsets against the partner's future earnings.
        batch.update(commissionSnap.ref, {
          reversedMinor: totalReversed,
          updatedAt: Timestamp.now(),
        });
        batch.set(db.collection('commissionLedger').doc(), {
          commissionId: orderId,
          orderId,
          partnerId: c.partnerId,
          fromStatus: cur,
          toStatus: 'RECOVERABLE',
          amountMinor: -reverseMinor,
          reason: `Order ${orderId} refunded ${refundAmount} paise (paid commission -> recoverable): ${reason}`,
          actorId: uid,
          actorType: 'staff',
          createdAt: Timestamp.now(),
        });
      } else {
        const nextStatus = fullyReversed ? 'REVERSED' : cur;
        batch.update(commissionSnap.ref, {
          status: nextStatus,
          reversedMinor: totalReversed,
          netPayableMinor: Math.max(0, (Number(c.netPayableMinor) || 0) - reverseMinor),
          updatedAt: Timestamp.now(),
        });
        batch.set(db.collection('commissionLedger').doc(), {
          commissionId: orderId,
          orderId,
          partnerId: c.partnerId,
          fromStatus: cur,
          toStatus: fullyReversed ? 'REVERSED' : cur,
          amountMinor: -reverseMinor,
          reason: `Order ${orderId} refunded ${refundAmount} paise${fullyReversed ? ' (full)' : ' (partial)'}: ${reason}`,
          actorId: uid,
          actorType: 'staff',
          createdAt: Timestamp.now(),
        });
      }
    }
  }

  // Record a refund event for reconciliation (PRD 17).
  batch.set(db.collection('refunds').doc(), {
    orderId,
    amountMinor: refundAmount,
    reason,
    fullyRefunded: fullyRefundedNow,
    refundedBy: uid,
    createdAt: Timestamp.now(),
  });

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

// Item 15 - the Referral Audit admin page. referrer/referee names+emails
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

// ===========================================================================
// Partner Commission Framework - Phase 1 (staff actions). Folded in here,
// not a new api/partner.ts, because Vercel Hobby caps this project at 12
// function files and a 13th fails to deploy (re-confirmed 2026-09-03 under
// Fluid Compute - see the vercel-hobby-function-cap memory). User / partner /
// public actions live in api/auth.ts. Every action here is requireAdmin for
// the pilot; finance_admin gets its own actions in Phase 4.
// ===========================================================================

const PARTNER_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const PARTNER_AGREEMENT_VERSION = '2026-09-03';

function randomPartnerAlphabet(n: number): string {
  const bytes = randomBytes(n);
  let s = '';
  for (const b of bytes) s += PARTNER_CODE_ALPHABET[b % PARTNER_CODE_ALPHABET.length];
  return s;
}
const generatePartnerId = () => `HCP${randomPartnerAlphabet(10)}`;
const generatePartnerCode = () => `HCP${randomPartnerAlphabet(6)}`;

function redactForAudit(input: unknown): unknown {
  const SENSITIVE = ['pan', 'aadhaar', 'aadhar', 'bank', 'account', 'ifsc', 'upi', 'vpa', 'password', 'secret', 'token', 'otp', 'signature'];
  const maskEmail = (v: string) => {
    const at = v.indexOf('@');
    return at > 0 ? `${v[0]}***${v.slice(at)}` : '***';
  };
  if (input === null || typeof input !== 'object') {
    if (typeof input === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input)) return maskEmail(input);
    return input;
  }
  if (Array.isArray(input)) return input.map(redactForAudit);
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(input as Record<string, unknown>)) {
    const lk = k.toLowerCase();
    if (SENSITIVE.some((s) => lk.includes(s))) out[k] = '[redacted]';
    else if (/email/i.test(k) && typeof val === 'string') out[k] = maskEmail(val);
    else out[k] = redactForAudit(val);
  }
  return out;
}

async function writePartnerAudit(args: {
  entityType: string;
  entityId: string;
  action: string;
  actorId: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}) {
  await db.collection('auditEvents').add({
    entityType: args.entityType,
    entityId: args.entityId,
    action: args.action,
    actorId: args.actorId,
    actorType: 'staff',
    before: args.before === undefined ? null : redactForAudit(args.before),
    after: args.after === undefined ? null : redactForAudit(args.after),
    reason: args.reason ?? null,
    correlationId: null,
    createdAt: FieldValue.serverTimestamp(),
  });
}

async function listPartnerApplications(data: unknown) {
  const status = (data as { status?: string })?.status;
  let q: FirebaseFirestore.Query = db.collection('partnerApplications');
  if (status && ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'].includes(status)) {
    q = q.where('status', '==', status);
  }
  const snap = await q.orderBy('submittedAt', 'desc').limit(200).get();
  return {
    applications: snap.docs.map((d) => {
      const a = d.data();
      return {
        id: d.id,
        userId: a.userId as string,
        legalName: a.legalName as string,
        displayName: a.displayName as string,
        dateOfBirth: a.dateOfBirth as string,
        phone: a.phone as string,
        partnerType: a.partnerType as string,
        country: (a.country as string) ?? null,
        panMasked: (a.panMasked as string | null) ?? null,
        panLast4: (a.panLast4 as string | null) ?? null,
        panStatus: (a.panStatus as string | null) ?? null,
        gstinMasked: (a.gstinMasked as string | null) ?? null,
        duplicatePanFlag: a.duplicatePanFlag === true,
        status: a.status as string,
        reviewNote: (a.reviewNote as string | null) ?? null,
        partnerId: (a.partnerId as string | null) ?? null,
        submittedAt: a.submittedAt ?? null,
      };
    }),
  };
}

// PRD 14.4: the full submitted application must be reviewable BEFORE
// approval - not just the summary row. Address/PAN-name/GSTIN live in the
// deny-all partnerApplicationKyc collection (not on the application doc
// itself, so the applicant's own read-back of their application never sees
// them); this assembles the reviewer's view, masked the same way the
// approved-partner KYC view is.
async function getPartnerApplicationDetail(body: unknown) {
  const parsed = z.object({ applicationId: z.string().trim().min(1) }).safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const [appSnap, kSnap] = await Promise.all([
    db.collection('partnerApplications').doc(parsed.data.applicationId).get(),
    db.collection('partnerApplicationKyc').doc(parsed.data.applicationId).get(),
  ]);
  if (!appSnap.exists) throw Err.invalidArgument('Application not found');
  const a = appSnap.data()!;
  const k = kSnap.data();
  return {
    id: appSnap.id,
    legalName: a.legalName as string,
    displayName: a.displayName as string,
    dateOfBirth: a.dateOfBirth as string,
    phone: a.phone as string,
    partnerType: a.partnerType as string,
    country: (a.country as string) ?? 'IN',
    address: k ? [k.addressLine, k.city, k.state, k.postalCode, k.country].filter(Boolean).join(', ') : null,
    panMasked: (a.panMasked as string | null) ?? null,
    panName: (k?.panName as string | null) ?? null,
    gstinMasked: (a.gstinMasked as string | null) ?? null,
    duplicatePanFlag: a.duplicatePanFlag === true,
    agreementVersion: (a.agreementVersion as string) ?? null,
    status: a.status as string,
    submittedAt: a.submittedAt ?? null,
  };
}

const reviewPartnerApplicationSchema = z.object({
  applicationId: z.string().min(1),
  decision: z.enum(['approve', 'reject']),
  note: z.string().trim().max(500).optional(),
});

async function reviewPartnerApplication(uid: string, body: unknown) {
  const parsed = reviewPartnerApplicationSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { applicationId, decision, note } = parsed.data;

  const appRef = db.collection('partnerApplications').doc(applicationId);
  const appSnap = await appRef.get();
  if (!appSnap.exists) throw Err.invalidArgument('Application not found');
  const app = appSnap.data()!;
  if (app.status !== 'SUBMITTED' && app.status !== 'UNDER_REVIEW') {
    throw Err.conflict(`This application is already ${String(app.status).toLowerCase()}.`);
  }

  const now = FieldValue.serverTimestamp();

  if (decision === 'reject') {
    await appRef.update({ status: 'REJECTED', reviewedBy: uid, reviewNote: note ?? null, updatedAt: now });
    // Sensitive KYC has no purpose once rejected - drop it.
    await db.collection('partnerApplicationKyc').doc(applicationId).delete().catch(() => {});
    await writePartnerAudit({
      entityType: 'partnerApplication',
      entityId: applicationId,
      action: 'reject',
      actorId: uid,
      before: { status: app.status },
      after: { status: 'REJECTED' },
      reason: note ?? null,
    });
    return { status: 'REJECTED' as const };
  }

  // approve
  const partnerId = generatePartnerId();
  let code = generatePartnerCode();
  if ((await db.collection('referralCodes').doc(code).get()).exists) code = generatePartnerCode();
  const productId = (app.productId as string) ?? 'HELPCERTIFY';

  // Promote the application's sensitive KYC to the partner-scoped deny-all
  // collection, then remove the application copy.
  const appKycSnap = await db.collection('partnerApplicationKyc').doc(applicationId).get();
  const appKyc = appKycSnap.data();
  const hasPan = !!appKyc?.panFull;
  // PAN captured but not yet verified against a provider -> payouts on hold
  // until a finance user clears it (or the country needs no PAN).
  const payoutStatus = app.country === 'IN' || hasPan ? 'KYC_ACTION_REQUIRED' : 'OK';

  const batch = db.batch();
  batch.set(db.collection('partners').doc(partnerId), {
    linkedUserId: app.userId,
    productId,
    displayName: app.displayName,
    partnerType: app.partnerType,
    status: 'ACTIVE',
    agreementVersion: app.agreementVersion ?? PARTNER_AGREEMENT_VERSION,
    suspendedReason: null,
    createdBy: uid,
    country: (app.country as string) ?? 'IN',
    panMasked: (app.panMasked as string | null) ?? null,
    panLast4: (app.panLast4 as string | null) ?? null,
    panStatus: (app.panStatus as string | null) ?? null,
    payoutStatus,
    createdAt: now,
    updatedAt: now,
  });
  if (appKyc) {
    batch.set(db.collection('partnerKyc').doc(partnerId), {
      partnerId,
      panFull: appKyc.panFull ?? null,
      panHash: appKyc.panHash ?? null,
      panName: appKyc.panName ?? null,
      gstin: appKyc.gstin ?? null,
      addressLine: appKyc.addressLine ?? null,
      city: appKyc.city ?? null,
      state: appKyc.state ?? null,
      postalCode: appKyc.postalCode ?? null,
      country: appKyc.country ?? 'IN',
      panStatus: hasPan ? 'FORMAT_VALID' : 'INVALID',
      verificationProvider: null,
      verificationRef: null,
      verifiedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    batch.delete(db.collection('partnerApplicationKyc').doc(applicationId));
  }
  batch.update(db.collection('users').doc(app.userId as string), { partnerId, updatedAt: now });
  batch.set(db.collection('partnerAgreements').doc(), {
    partnerId,
    version: app.agreementVersion ?? PARTNER_AGREEMENT_VERSION,
    acceptedAt: app.submittedAt ?? now,
    ip: null,
  });
  batch.set(db.collection('referralCodes').doc(code), {
    partnerId,
    productId,
    offerId: null,
    active: true,
    createdAt: now,
  });
  batch.update(appRef, { status: 'APPROVED', reviewedBy: uid, reviewNote: note ?? null, partnerId, updatedAt: now });
  await batch.commit();

  await writePartnerAudit({
    entityType: 'partner',
    entityId: partnerId,
    action: 'approve',
    actorId: uid,
    before: { applicationStatus: app.status },
    after: { partnerId, linkedUserId: app.userId, firstCode: code },
    reason: note ?? null,
  });
  return { status: 'APPROVED' as const, partnerId, referralCode: code };
}

const partnerStatusChangeSchema = z.object({ partnerId: z.string().min(1), reason: z.string().trim().max(500).optional() });

async function setPartnerStatus(uid: string, body: unknown, next: 'ACTIVE' | 'SUSPENDED') {
  const parsed = partnerStatusChangeSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { partnerId, reason } = parsed.data;
  const ref = db.collection('partners').doc(partnerId);
  const snap = await ref.get();
  if (!snap.exists) throw Err.invalidArgument('Partner not found');
  const prev = snap.data()!.status as string;

  const codesSnap = await db.collection('referralCodes').where('partnerId', '==', partnerId).get();
  const batch = db.batch();
  batch.update(ref, { status: next, suspendedReason: next === 'SUSPENDED' ? reason ?? null : null, updatedAt: FieldValue.serverTimestamp() });
  for (const c of codesSnap.docs) batch.update(c.ref, { active: next === 'ACTIVE' });
  await batch.commit();

  await writePartnerAudit({
    entityType: 'partner',
    entityId: partnerId,
    action: next === 'SUSPENDED' ? 'suspend' : 'reactivate',
    actorId: uid,
    before: { status: prev },
    after: { status: next, codesAffected: codesSnap.size },
    reason: reason ?? null,
  });
  return { status: next, codesAffected: codesSnap.size };
}

async function listPartnersAdmin() {
  const snap = await db.collection('partners').orderBy('createdAt', 'desc').limit(200).get();
  return {
    partners: snap.docs.map((d) => {
      const p = d.data();
      return {
        partnerId: d.id,
        linkedUserId: p.linkedUserId as string,
        displayName: p.displayName as string,
        partnerType: p.partnerType as string,
        status: p.status as string,
        country: (p.country as string) ?? 'IN',
        panMasked: (p.panMasked as string | null) ?? null,
        panLast4: (p.panLast4 as string | null) ?? null,
        payoutStatus: (p.payoutStatus as string) ?? 'OK',
        createdAt: p.createdAt ?? null,
      };
    }),
  };
}

// --- Partner KYC (PRD 6 + 15) -------------------------------------------
// Staff see a masked view. A full-PAN reveal is a separate action gated on
// users/{uid}.canRevealPan, needs a reason, and writes an audit event.

async function getPartnerKycMasked(body: unknown) {
  const parsed = z.object({ partnerId: z.string().trim().min(1) }).safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const [pSnap, kSnap] = await Promise.all([
    db.collection('partners').doc(parsed.data.partnerId).get(),
    db.collection('partnerKyc').doc(parsed.data.partnerId).get(),
  ]);
  if (!pSnap.exists) throw Err.invalidArgument('Partner not found');
  const p = pSnap.data()!;
  const k = kSnap.data();
  return {
    partnerId: parsed.data.partnerId,
    country: (p.country as string) ?? 'IN',
    payoutStatus: (p.payoutStatus as string) ?? 'OK',
    panMasked: (p.panMasked as string | null) ?? null,
    panStatus: (k?.panStatus as string | null) ?? (p.panStatus as string | null) ?? null,
    panName: (k?.panName as string | null) ?? null,
    gstinMasked: k?.gstin ? `${String(k.gstin).slice(0, 2)}****${String(k.gstin).slice(-4)}` : null,
    address: k
      ? [k.addressLine, k.city, k.state, k.postalCode, k.country].filter(Boolean).join(', ')
      : null,
    verifiedAt: k?.verifiedAt ?? null,
  };
}

// PRD 14.4 - the full submitted application, grouped, with PAN/bank masked.
// Opened from /admin/partners/{partnerId}, not the list page.
async function getPartnerDetail(body: unknown) {
  const parsed = z.object({ partnerId: z.string().trim().min(1) }).safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const partnerId = parsed.data.partnerId;

  const pSnap = await db.collection('partners').doc(partnerId).get();
  if (!pSnap.exists) throw Err.invalidArgument('Partner not found');
  const p = pSnap.data()!;

  const [kSnap, appSnap, agreementsSnap, codesSnap, commissionsSnap, payoutsSnap, auditSnap, rolesSnap, earningsSnap] =
    await Promise.all([
      db.collection('partnerKyc').doc(partnerId).get(),
      db.collection('partnerApplications').where('partnerId', '==', partnerId).limit(1).get(),
      db.collection('partnerAgreements').where('partnerId', '==', partnerId).get(),
      db.collection('referralCodes').where('partnerId', '==', partnerId).get(),
      db.collection('commissions').where('partnerId', '==', partnerId).limit(500).get(),
      db.collection('payouts').where('partnerId', '==', partnerId).limit(60).get(),
      db.collection('auditEvents').where('entityId', '==', partnerId).limit(50).get(),
      db.collection('partnerRoles').where('partnerId', '==', partnerId).get(),
      db.collection('earnings').where('partnerId', '==', partnerId).limit(500).get(),
    ]);

  const k = kSnap.data();
  const app = appSnap.docs[0]?.data();
  const userSnap = await db.collection('users').doc(p.linkedUserId as string).get();
  const user = userSnap.data();

  const money = (pred: (s: string) => boolean) =>
    commissionsSnap.docs
      .filter((d) => pred(d.data().status as string))
      .reduce((t, d) => t + (Number(d.data().netPayableMinor) || 0), 0);

  const referralEventCount = (
    await Promise.all(
      codesSnap.docs.map((c) => db.collection('referralEvents').where('code', '==', c.id).limit(500).get()),
    )
  ).reduce((t, s) => t + s.size, 0);

  return {
    partnerId,
    header: {
      legalName: (app?.legalName as string) ?? (user?.name as string) ?? '',
      displayName: p.displayName as string,
      status: p.status as string,
      payoutStatus: (p.payoutStatus as string) ?? 'OK',
      partnerType: p.partnerType as string,
      createdAt: p.createdAt ?? null,
      applicationDate: app?.submittedAt ?? null,
    },
    contact: {
      email: (user?.email as string) ?? null,
      phone: (app?.phone as string) ?? null, // authorised detail view only
      dateOfBirth: (app?.dateOfBirth as string) ?? null,
      address: k
        ? [k.addressLine, k.city, k.state, k.postalCode, k.country].filter(Boolean).join(', ')
        : null,
      emailVerified: user?.emailVerified !== false,
    },
    tax: {
      country: (p.country as string) ?? 'IN',
      panMasked: (p.panMasked as string | null) ?? null,
      panStatus: (k?.panStatus as string | null) ?? (p.panStatus as string | null) ?? null,
      panName: (k?.panName as string | null) ?? null,
      gstinMasked: k?.gstin ? `${String(k.gstin).slice(0, 2)}****${String(k.gstin).slice(-4)}` : null,
      duplicatePanFlag: app?.duplicatePanFlag === true,
      verifiedAt: k?.verifiedAt ?? null,
      verificationRef: (k?.verificationRef as string | null) ?? null,
    },
    payout: (() => {
      const pd = p.payout;
      if (!pd?.method) return null;
      return {
        method: pd.method as string,
        accountName: (pd.accountName as string) ?? '',
        bankAccountLast4: pd.bankAccountNumber ? `••••${String(pd.bankAccountNumber).slice(-4)}` : null,
        bankIfsc: (pd.bankIfsc as string | null) ?? null,
        upiVpa: pd.upiVpa ? `••••${String(pd.upiVpa).slice(-6)}` : null,
      };
    })(),
    agreements: agreementsSnap.docs.map((d) => ({ version: d.data().version, acceptedAt: d.data().acceptedAt ?? null })),
    codes: codesSnap.docs.map((d) => ({ code: d.id, active: d.data().active === true })),
    creatorRoles: rolesSnap.docs.map((d) => ({ role: d.data().role as string, status: d.data().status as string })),
    creatorEarnings: (() => {
      const em = (pred: (s: string) => boolean) =>
        earningsSnap.docs
          .filter((d) => pred(d.data().status as string))
          .reduce((t, d) => t + (Number(d.data().netMinor) || 0), 0);
      return {
        count: earningsSnap.size,
        pendingMinor: em((s) => ['PENDING_HOLD', 'APPROVED'].includes(s)),
        payableMinor: em((s) => ['PAYABLE', 'PROCESSING'].includes(s)),
        paidMinor: em((s) => s === 'PAID'),
        reversedMinor: em((s) => ['REVERSED', 'RECOVERABLE'].includes(s)),
      };
    })(),
    performance: {
      referralEventCount,
      commissionCount: commissionsSnap.size,
      pendingMinor: money((s) => ['PENDING_HOLD', 'ON_HOLD', 'APPROVED'].includes(s)),
      payableMinor: money((s) => ['PAYABLE', 'PROCESSING'].includes(s)),
      paidMinor: money((s) => s === 'PAID'),
      reversedMinor: money((s) => ['REVERSED', 'RECOVERABLE'].includes(s)),
    },
    payouts: payoutsSnap.docs
      .map((d) => ({
        id: d.id,
        periodLabel: d.data().periodLabel as string,
        netMinor: Number(d.data().netMinor) || 0,
        currency: (d.data().currency as string) ?? 'INR',
        status: d.data().status as string,
        externalReference: (d.data().externalReference as string | null) ?? null,
      }))
      .sort((a, b) => (b.periodLabel > a.periodLabel ? 1 : -1)),
    audit: auditSnap.docs
      .map((d) => ({
        action: d.data().action as string,
        actorId: d.data().actorId as string,
        reason: (d.data().reason as string | null) ?? null,
        createdAt: d.data().createdAt ?? null,
      }))
      .sort((a, b) => (Number(b.createdAt?.toMillis?.() ?? 0) - Number(a.createdAt?.toMillis?.() ?? 0))),
  };
}

const revealPanSchema = z.object({
  partnerId: z.string().trim().min(1),
  reason: z.string().trim().min(5).max(300),
});

async function revealPartnerPan(uid: string, body: unknown) {
  const parsed = revealPanSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  // Field-level permission, NOT role-wide (PRD 15).
  const me = (await db.collection('users').doc(uid).get()).data();
  if (me?.canRevealPan !== true) {
    throw Err.permissionDenied('You do not have permission to reveal full PAN.');
  }
  const kSnap = await db.collection('partnerKyc').doc(parsed.data.partnerId).get();
  if (!kSnap.exists || !kSnap.data()?.panFull) throw Err.invalidArgument('No PAN on file for this partner');

  await writePartnerAudit({
    entityType: 'partnerKyc',
    entityId: parsed.data.partnerId,
    action: 'revealPan',
    actorId: uid,
    reason: parsed.data.reason,
    after: { revealed: true },
  });
  return { pan: kSnap.data()!.panFull as string };
}

const setPayoutStatusSchema = z.object({
  partnerId: z.string().trim().min(1),
  payoutStatus: z.enum(['OK', 'KYC_ACTION_REQUIRED', 'PAYOUT_BLOCKED']),
  reason: z.string().trim().max(300).optional(),
});

async function setPartnerPayoutStatus(uid: string, body: unknown) {
  const parsed = setPayoutStatusSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const ref = db.collection('partners').doc(parsed.data.partnerId);
  const snap = await ref.get();
  if (!snap.exists) throw Err.invalidArgument('Partner not found');
  const before = (snap.data()!.payoutStatus as string) ?? 'OK';
  await ref.update({ payoutStatus: parsed.data.payoutStatus, updatedAt: FieldValue.serverTimestamp() });
  if (parsed.data.payoutStatus === 'OK') {
    await db
      .collection('partnerKyc')
      .doc(parsed.data.partnerId)
      .set({ panStatus: 'VERIFIED', verifiedAt: FieldValue.serverTimestamp() }, { merge: true })
      .catch(() => {});
    await db.collection('partners').doc(parsed.data.partnerId).set({ panStatus: 'VERIFIED' }, { merge: true }).catch(() => {});
  }
  await writePartnerAudit({
    entityType: 'partner',
    entityId: parsed.data.partnerId,
    action: 'setPayoutStatus',
    actorId: uid,
    before: { payoutStatus: before },
    after: { payoutStatus: parsed.data.payoutStatus },
    reason: parsed.data.reason ?? null,
  });
  return { payoutStatus: parsed.data.payoutStatus };
}

const savePartnerProductSchema = z.object({
  productId: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(80),
  status: z.enum(['ACTIVE', 'PAUSED']).default('ACTIVE'),
  baseUrl: z.string().trim().url(),
  currency: z.enum(['INR', 'USD']).default('INR'),
  defaultAttributionDays: z.number().int().min(1).max(365).default(30),
  defaultHoldDays: z.number().int().min(0).max(180).default(7),
  defaultCommissionPolicyId: z.string().trim().min(1).max(60).nullable().default(null),
  allowReferralCode: z.boolean().default(true),
  allowLeadRegistration: z.boolean().default(false),
});

async function savePartnerProduct(uid: string, body: unknown) {
  const parsed = savePartnerProductSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const d = parsed.data;
  const ref = db.collection('products').doc(d.productId);
  const existing = await ref.get();
  const now = FieldValue.serverTimestamp();
  await ref.set(
    {
      name: d.name,
      status: d.status,
      baseUrl: d.baseUrl,
      currency: d.currency,
      defaultAttributionDays: d.defaultAttributionDays,
      defaultHoldDays: d.defaultHoldDays,
      defaultCommissionPolicyId: d.defaultCommissionPolicyId,
      allowReferralCode: d.allowReferralCode,
      allowLeadRegistration: d.allowLeadRegistration,
      createdAt: existing.exists ? existing.data()!.createdAt : now,
      updatedAt: now,
    },
    { merge: true },
  );
  await writePartnerAudit({
    entityType: 'product',
    entityId: d.productId,
    action: existing.exists ? 'update' : 'create',
    actorId: uid,
    after: { name: d.name, status: d.status },
  });
  return { productId: d.productId };
}

const savePartnerOfferSchema = z.object({
  offerId: z.string().trim().min(1).max(60),
  productId: z.string().trim().min(1).max(40),
  externalRef: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(120),
  eligiblePartnerTypes: z.array(z.enum(['referral', 'sales', 'implementation', 'agency'])).min(1),
  commissionPolicyId: z.string().trim().min(1),
  holdDays: z.number().int().min(0).max(180).default(7),
  combineWithDiscount: z.boolean().default(false),
  active: z.boolean().default(true),
});

async function savePartnerOffer(uid: string, body: unknown) {
  const parsed = savePartnerOfferSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const d = parsed.data;
  const policySnap = await db.collection('commissionPolicies').doc(d.commissionPolicyId).get();
  if (!policySnap.exists) throw Err.invalidArgument('That commission policy does not exist.');
  const ref = db.collection('offers').doc(d.offerId);
  const existing = await ref.get();
  const now = FieldValue.serverTimestamp();
  await ref.set(
    {
      productId: d.productId,
      externalRef: d.externalRef,
      name: d.name,
      eligiblePartnerTypes: d.eligiblePartnerTypes,
      commissionPolicyId: d.commissionPolicyId,
      holdDays: d.holdDays,
      combineWithDiscount: d.combineWithDiscount,
      validFrom: null,
      validTo: null,
      active: d.active,
      createdAt: existing.exists ? existing.data()!.createdAt : now,
      updatedAt: now,
    },
    { merge: true },
  );
  await writePartnerAudit({
    entityType: 'offer',
    entityId: d.offerId,
    action: existing.exists ? 'update' : 'create',
    actorId: uid,
    after: { name: d.name, policy: d.commissionPolicyId },
  });
  return { offerId: d.offerId };
}

const savePartnerPolicyVersionSchema = z.object({
  policyId: z.string().trim().min(1).optional(),
  productId: z.string().trim().min(1).max(40).default('HELPCERTIFY'),
  name: z.string().trim().min(1).max(80),
  ruleType: z.enum(['percent', 'fixed', 'tiered']),
  rateBasisPoints: z.number().int().min(0).max(10000).default(0),
  fixedAmountMinor: z.number().int().min(0).nullable().default(null),
  tiers: z.array(z.object({ minMonthlySales: z.number().int().min(0), rateBasisPoints: z.number().int().min(0).max(10000) })).nullable().default(null),
  maxCommissionMinor: z.number().int().min(0).nullable().default(null),
  firstPurchaseOnly: z.boolean().default(false),
});

async function savePartnerPolicyVersion(uid: string, body: unknown) {
  const parsed = savePartnerPolicyVersionSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const d = parsed.data;
  const now = FieldValue.serverTimestamp();

  const policyRef = d.policyId ? db.collection('commissionPolicies').doc(d.policyId) : db.collection('commissionPolicies').doc();
  const policySnap = await policyRef.get();
  const versionsSnap = await policyRef.collection('versions').orderBy('version', 'desc').limit(1).get();
  const nextVersion = versionsSnap.empty ? 1 : (versionsSnap.docs[0].data().version as number) + 1;

  const batch = db.batch();
  batch.set(
    policyRef,
    {
      productId: d.productId,
      name: d.name,
      activeVersion: nextVersion,
      createdAt: policySnap.exists ? policySnap.data()!.createdAt : now,
      updatedAt: now,
    },
    { merge: true },
  );
  batch.set(policyRef.collection('versions').doc(String(nextVersion)), {
    version: nextVersion,
    ruleType: d.ruleType,
    rateBasisPoints: d.rateBasisPoints,
    fixedAmountMinor: d.fixedAmountMinor,
    tiers: d.tiers,
    maxCommissionMinor: d.maxCommissionMinor,
    firstPurchaseOnly: d.firstPurchaseOnly,
    createdBy: uid,
    createdAt: now,
  });
  await batch.commit();

  await writePartnerAudit({
    entityType: 'commissionPolicy',
    entityId: policyRef.id,
    action: 'saveVersion',
    actorId: uid,
    after: { version: nextVersion, ruleType: d.ruleType, rateBasisPoints: d.rateBasisPoints },
  });
  return { policyId: policyRef.id, version: nextVersion };
}

async function getPartnerFrameworkSettings() {
  const snap = await db.collection('appSettings').doc('partnerFramework').get();
  const d = snap.data();
  return { enabled: d?.enabled === true, applicationsOpen: d?.applicationsOpen === true };
}

const savePartnerFrameworkFlagsSchema = z.object({ enabled: z.boolean(), applicationsOpen: z.boolean() });

async function savePartnerFrameworkFlags(uid: string, body: unknown) {
  const parsed = savePartnerFrameworkFlagsSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  await db
    .collection('appSettings')
    .doc('partnerFramework')
    .set({ ...parsed.data, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await writePartnerAudit({
    entityType: 'appSettings',
    entityId: 'partnerFramework',
    action: 'update',
    actorId: uid,
    after: parsed.data,
  });
  return parsed.data;
}

// --- Partner Commission Framework (Phase 2, staff) ---

const listPartnerCommissionsSchema = z.object({
  status: z.string().trim().max(20).optional(),
  partnerId: z.string().trim().max(40).optional(),
});

async function listPartnerCommissions(body: unknown) {
  const parsed = listPartnerCommissionsSchema.safeParse(body ?? {});
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  // Indexed single-filter queries only (see firestore.indexes.json). A
  // partnerId filter sorts in memory so status+partner together needs no
  // extra composite index.
  let q: FirebaseFirestore.Query = db.collection('commissions');
  if (parsed.data.partnerId) {
    q = q.where('partnerId', '==', parsed.data.partnerId);
    if (parsed.data.status) q = q.where('status', '==', parsed.data.status);
    const snap = await q.limit(300).get();
    const ms = (v: unknown) => (v && typeof (v as { toMillis?: () => number }).toMillis === 'function' ? (v as { toMillis: () => number }).toMillis() : 0);
    const rows = snap.docs
      .map((d) => ({ id: d.id, data: d.data() }))
      .sort((a, b) => ms(b.data.createdAt) - ms(a.data.createdAt))
      .map((r) => ({ id: r.id, ...r.data }));
    return { commissions: rows };
  }
  if (parsed.data.status) q = q.where('status', '==', parsed.data.status);
  const snap = await q.orderBy('createdAt', 'desc').limit(300).get();
  return { commissions: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
}

const setCommissionHoldSchema = z.object({
  commissionId: z.string().trim().min(1),
  reason: z.string().trim().min(1).max(500).optional(),
});

// Manual finance override: force a commission ON_HOLD (needs review) or lift
// the hold back to PENDING_HOLD so the daily job can pick it up again.
async function setCommissionHold(uid: string, body: unknown, hold: boolean) {
  const parsed = setCommissionHoldSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { commissionId, reason } = parsed.data;
  const ref = db.collection('commissions').doc(commissionId);
  const snap = await ref.get();
  if (!snap.exists) throw Err.invalidArgument('Commission not found');
  const cur = snap.data()!.status as string;
  if (hold && !['PENDING_HOLD', 'APPROVED', 'PAYABLE'].includes(cur)) {
    throw Err.conflict(`Cannot hold a commission that is "${cur}"`);
  }
  if (!hold && cur !== 'ON_HOLD') {
    throw Err.conflict(`Commission is not on hold (it is "${cur}")`);
  }
  const next = hold ? 'ON_HOLD' : 'PENDING_HOLD';
  const batch = db.batch();
  batch.update(ref, { status: next, onHoldReason: hold ? (reason ?? 'Manual review') : null, updatedAt: Timestamp.now() });
  batch.set(db.collection('commissionLedger').doc(), {
    commissionId,
    orderId: commissionId,
    partnerId: snap.data()!.partnerId,
    fromStatus: cur,
    toStatus: next,
    amountMinor: 0,
    reason: reason ?? (hold ? 'Placed on hold for review' : 'Hold lifted'),
    actorId: uid,
    actorType: 'staff',
    createdAt: Timestamp.now(),
  });
  await batch.commit();
  await writePartnerAudit({
    entityType: 'commission',
    entityId: commissionId,
    action: hold ? 'hold' : 'unhold',
    actorId: uid,
    before: { status: cur },
    after: { status: next },
    reason: reason ?? null,
  });
  return { status: next };
}

// Daily hold-release job (Vercel Cron -> GET /api/admin). Moves every
// PENDING_HOLD commission whose holdUntil has passed to PAYABLE. ON_HOLD is
// deliberately skipped - it needs a human. Batched in chunks of 400.
async function releaseCommissionHolds(): Promise<{ released: number }> {
  const now = Timestamp.now();
  const due = await db
    .collection('commissions')
    .where('status', '==', 'PENDING_HOLD')
    .where('holdUntil', '<=', now)
    .limit(400)
    .get();
  if (due.empty) return { released: 0 };

  const batch = db.batch();
  for (const doc of due.docs) {
    batch.update(doc.ref, { status: 'PAYABLE', updatedAt: now });
    batch.set(db.collection('commissionLedger').doc(), {
      commissionId: doc.id,
      orderId: doc.id,
      partnerId: doc.data().partnerId,
      fromStatus: 'PENDING_HOLD',
      toStatus: 'PAYABLE',
      amountMinor: Number(doc.data().netPayableMinor) || 0,
      reason: 'Hold period elapsed; released for payout',
      actorId: 'system',
      actorType: 'system',
      createdAt: now,
    });
  }
  await batch.commit();

  // Creator/reviewer earnings (Phase 4b-3) share the hold-release job.
  const dueEarnings = await db
    .collection('earnings')
    .where('status', '==', 'PENDING_HOLD')
    .where('holdUntil', '<=', now)
    .limit(400)
    .get();
  if (!dueEarnings.empty) {
    const eb = db.batch();
    for (const doc of dueEarnings.docs) {
      eb.update(doc.ref, { status: 'PAYABLE', updatedAt: now });
      eb.set(db.collection('earningsLedger').doc(), {
        earningId: doc.id,
        partnerId: doc.data().partnerId,
        fromStatus: 'PENDING_HOLD',
        toStatus: 'PAYABLE',
        amountMinor: Number(doc.data().netMinor) || 0,
        reason: 'Correction window elapsed; released for payout',
        actorId: 'system',
        actorType: 'system',
        createdAt: now,
      });
    }
    await eb.commit();
  }

  return { released: due.size + dueEarnings.size };
}

// --- Partner payouts (Phase 3, MANUAL - no money moves here) --------------
// The pilot payout is finance recording an external bank transfer by hand.
// State: commissions PAYABLE -> PROCESSING (batched) -> PAID (recorded), or
// back to PAYABLE if the batch is cancelled. payoutBatches: DRAFT ->
// APPROVED (by a different staff member) -> PAID. Pure spec:
// src/features/partner/lib/payoutBatch.ts.
const MIN_PAYOUT_MINOR = 50000; // ₹500

async function minPayoutMinor(): Promise<number> {
  try {
    const snap = await db.collection('appSettings').doc('general').get();
    const v = Number(snap.data()?.minPayoutMinor);
    return Number.isFinite(v) && v > 0 ? v : MIN_PAYOUT_MINOR;
  } catch {
    return MIN_PAYOUT_MINOR;
  }
}

// Shared by listPayableCommissions + createPayoutBatch: gathers every
// PAYABLE line item - sales commissions AND creator/reviewer earnings
// (Phase 4b-3) - grouped per partner+currency. Sales commission and creator
// earnings are separate liabilities but share one payout run (PRD 9A).
type PayGroup = {
  partnerId: string;
  currency: string;
  commissionIds: string[];
  earningIds: string[];
  commissionMinor: number;
  earningMinor: number;
  grossMinor: number;
};

async function gatherPayable(partnerIds?: string[]): Promise<Map<string, PayGroup>> {
  const [commSnap, earnSnap] = await Promise.all([
    db.collection('commissions').where('status', '==', 'PAYABLE').limit(1000).get(),
    db.collection('earnings').where('status', '==', 'PAYABLE').limit(1000).get(),
  ]);
  const byPartner = new Map<string, PayGroup>();
  const grp = (partnerId: string, currency: string): PayGroup => {
    const key = `${partnerId}::${currency}`;
    const g =
      byPartner.get(key) ??
      { partnerId, currency, commissionIds: [], earningIds: [], commissionMinor: 0, earningMinor: 0, grossMinor: 0 };
    byPartner.set(key, g);
    return g;
  };
  for (const doc of commSnap.docs) {
    const d = doc.data();
    if (partnerIds && !partnerIds.includes(d.partnerId)) continue;
    const g = grp(d.partnerId, (d.currency as string) ?? 'INR');
    g.commissionIds.push(doc.id);
    const m = Math.max(0, Number(d.netPayableMinor) || 0);
    g.commissionMinor += m;
    g.grossMinor += m;
  }
  for (const doc of earnSnap.docs) {
    const d = doc.data();
    if (partnerIds && !partnerIds.includes(d.partnerId)) continue;
    const g = grp(d.partnerId, (d.currency as string) ?? 'INR');
    g.earningIds.push(doc.id);
    const m = Math.max(0, Number(d.netMinor) || 0);
    g.earningMinor += m;
    g.grossMinor += m;
  }
  return byPartner;
}

async function listPayableCommissions() {
  const min = await minPayoutMinor();
  const byPartner = await gatherPayable();
  const groups = await Promise.all(
    [...byPartner.values()].map(async (g) => {
      const p = (await db.collection('partners').doc(g.partnerId).get()).data();
      return {
        partnerId: g.partnerId,
        currency: g.currency,
        commissionIds: g.commissionIds,
        earningIds: g.earningIds,
        commissionMinor: g.commissionMinor,
        earningMinor: g.earningMinor,
        grossMinor: g.grossMinor,
        meetsMinimum: g.grossMinor >= min,
        displayName: (p?.displayName as string) ?? g.partnerId,
        hasPayoutDetails: !!p?.payout?.method,
        payoutStatus: (p?.payoutStatus as string) ?? 'OK',
        payoutEligible: ((p?.payoutStatus as string) ?? 'OK') === 'OK',
      };
    }),
  );
  groups.sort((a, b) => b.grossMinor - a.grossMinor);
  return { groups, minPayoutMinor: min };
}

const createPayoutBatchSchema = z.object({
  periodLabel: z.string().trim().regex(/^\d{4}-\d{2}$/, 'Use YYYY-MM'),
  partnerIds: z.array(z.string().trim().min(1)).min(1).optional(),
});

async function createPayoutBatch(uid: string, body: unknown) {
  const parsed = createPayoutBatchSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { periodLabel, partnerIds } = parsed.data;
  const min = await minPayoutMinor();

  const byPartner = await gatherPayable(partnerIds);

  // A partner is only includable when they clear the minimum AND their KYC
  // payout status is OK (PRD 6: KYC_ACTION_REQUIRED / PAYOUT_BLOCKED hold).
  const statusByPartner = new Map<string, string>();
  await Promise.all(
    [...new Set([...byPartner.values()].map((g) => g.partnerId))].map(async (pid) => {
      const p = (await db.collection('partners').doc(pid).get()).data();
      statusByPartner.set(pid, (p?.payoutStatus as string) ?? 'OK');
    }),
  );
  const blocked = [...byPartner.values()].filter((g) => g.grossMinor >= min && statusByPartner.get(g.partnerId) !== 'OK');
  const eligible = [...byPartner.values()].filter((g) => g.grossMinor >= min && statusByPartner.get(g.partnerId) === 'OK');
  if (eligible.length === 0) {
    throw Err.conflict(
      blocked.length
        ? `${blocked.length} partner(s) meet the minimum but are held for KYC. Clear their payout status first.`
        : 'No partner has enough PAYABLE earnings to meet the minimum payout.',
    );
  }

  const currency = eligible[0].currency;
  if (eligible.some((g) => g.currency !== currency)) {
    throw Err.conflict('Mixed currencies in one batch is not supported. Filter to a single currency.');
  }

  const batchRef = db.collection('payoutBatches').doc();
  const grossMinor = eligible.reduce((t, g) => t + g.grossMinor, 0);
  const commissionCount = eligible.reduce((t, g) => t + g.commissionIds.length + g.earningIds.length, 0);
  const now = Timestamp.now();

  const wb = db.batch();
  wb.set(batchRef, {
    productId: 'HELPCERTIFY',
    periodLabel,
    status: 'DRAFT',
    commissionCount,
    grossMinor,
    currency,
    createdBy: uid,
    approvedBy: null,
    paidBy: null,
    externalReference: null,
    note: null,
    createdAt: now,
    updatedAt: now,
  });
  for (const g of eligible) {
    wb.set(db.collection('payouts').doc(`${batchRef.id}_${g.partnerId}`), {
      batchId: batchRef.id,
      partnerId: g.partnerId,
      productId: 'HELPCERTIFY',
      periodLabel,
      currency: g.currency,
      commissionIds: g.commissionIds,
      earningIds: g.earningIds,
      commissionMinor: g.commissionMinor,
      earningMinor: g.earningMinor,
      grossMinor: g.grossMinor,
      deductionsMinor: 0,
      netMinor: g.grossMinor,
      status: 'PENDING',
      externalReference: null,
      paidAt: null,
      createdAt: now,
      updatedAt: now,
    });
    for (const cid of g.commissionIds) {
      wb.update(db.collection('commissions').doc(cid), { status: 'PROCESSING', payoutBatchId: batchRef.id, updatedAt: now });
      wb.set(db.collection('commissionLedger').doc(), {
        commissionId: cid,
        orderId: cid,
        partnerId: g.partnerId,
        fromStatus: 'PAYABLE',
        toStatus: 'PROCESSING',
        amountMinor: 0,
        reason: `Added to payout batch ${batchRef.id}`,
        actorId: uid,
        actorType: 'staff',
        createdAt: now,
      });
    }
    for (const eid of g.earningIds) {
      wb.update(db.collection('earnings').doc(eid), { status: 'PROCESSING', payoutBatchId: batchRef.id, updatedAt: now });
      wb.set(db.collection('earningsLedger').doc(), {
        earningId: eid,
        partnerId: g.partnerId,
        fromStatus: 'PAYABLE',
        toStatus: 'PROCESSING',
        amountMinor: 0,
        reason: `Added to payout batch ${batchRef.id}`,
        actorId: uid,
        actorType: 'staff',
        createdAt: now,
      });
    }
  }
  await wb.commit();
  await writePartnerAudit({ entityType: 'payoutBatch', entityId: batchRef.id, action: 'create', actorId: uid, after: { periodLabel, grossMinor, lineItems: commissionCount } });
  return { batchId: batchRef.id, grossMinor, commissionCount, partnerCount: eligible.length };
}

const batchIdSchema = z.object({ batchId: z.string().trim().min(1) });

async function approvePayoutBatch(uid: string, body: unknown) {
  const parsed = batchIdSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const ref = db.collection('payoutBatches').doc(parsed.data.batchId);
  const snap = await ref.get();
  if (!snap.exists) throw Err.invalidArgument('Batch not found');
  const b = snap.data()!;
  if (b.status !== 'DRAFT') throw Err.conflict(`Only a DRAFT batch can be approved (this one is ${b.status})`);
  if (b.createdBy === uid) throw Err.conflict('The batch creator cannot approve it. A second staff member must approve.');
  await ref.update({ status: 'APPROVED', approvedBy: uid, updatedAt: Timestamp.now() });
  await writePartnerAudit({ entityType: 'payoutBatch', entityId: ref.id, action: 'approve', actorId: uid, before: { status: 'DRAFT' }, after: { status: 'APPROVED' } });
  return { status: 'APPROVED' };
}

const recordPaidSchema = z.object({
  batchId: z.string().trim().min(1),
  externalReference: z.string().trim().min(1).max(140),
  note: z.string().trim().max(500).optional(),
});

async function recordPayoutBatchPaid(uid: string, body: unknown) {
  const parsed = recordPaidSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { batchId, externalReference, note } = parsed.data;
  const ref = db.collection('payoutBatches').doc(batchId);
  const snap = await ref.get();
  if (!snap.exists) throw Err.invalidArgument('Batch not found');
  if (snap.data()!.status !== 'APPROVED') throw Err.conflict(`Only an APPROVED batch can be marked paid (this one is ${snap.data()!.status})`);

  const payouts = await db.collection('payouts').where('batchId', '==', batchId).get();
  const now = Timestamp.now();
  const wb = db.batch();
  wb.update(ref, { status: 'PAID', paidBy: uid, externalReference, note: note ?? null, updatedAt: now });
  for (const p of payouts.docs) {
    wb.update(p.ref, { status: 'PAID', externalReference, paidAt: now, updatedAt: now });
    for (const cid of (p.data().commissionIds as string[]) ?? []) {
      wb.update(db.collection('commissions').doc(cid), { status: 'PAID', updatedAt: now });
      wb.set(db.collection('commissionLedger').doc(), {
        commissionId: cid,
        orderId: cid,
        partnerId: p.data().partnerId,
        fromStatus: 'PROCESSING',
        toStatus: 'PAID',
        amountMinor: 0,
        reason: `Payout batch ${batchId} paid (ref ${externalReference})`,
        actorId: uid,
        actorType: 'staff',
        createdAt: now,
      });
    }
    for (const eid of (p.data().earningIds as string[]) ?? []) {
      wb.update(db.collection('earnings').doc(eid), { status: 'PAID', updatedAt: now });
      wb.set(db.collection('earningsLedger').doc(), {
        earningId: eid,
        partnerId: p.data().partnerId,
        fromStatus: 'PROCESSING',
        toStatus: 'PAID',
        amountMinor: 0,
        reason: `Payout batch ${batchId} paid (ref ${externalReference})`,
        actorId: uid,
        actorType: 'staff',
        createdAt: now,
      });
    }
  }
  await wb.commit();
  await writePartnerAudit({ entityType: 'payoutBatch', entityId: batchId, action: 'markPaid', actorId: uid, after: { externalReference } });
  return { status: 'PAID', payoutCount: payouts.size };
}

async function cancelPayoutBatch(uid: string, body: unknown) {
  const parsed = batchIdSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const ref = db.collection('payoutBatches').doc(parsed.data.batchId);
  const snap = await ref.get();
  if (!snap.exists) throw Err.invalidArgument('Batch not found');
  const cur = snap.data()!.status as string;
  if (cur === 'PAID') throw Err.conflict('A paid batch cannot be cancelled.');
  if (cur === 'CANCELLED') throw Err.conflict('Batch is already cancelled.');

  const payouts = await db.collection('payouts').where('batchId', '==', parsed.data.batchId).get();
  const now = Timestamp.now();
  const wb = db.batch();
  wb.update(ref, { status: 'CANCELLED', updatedAt: now });
  for (const p of payouts.docs) {
    wb.update(p.ref, { status: 'FAILED', updatedAt: now });
    for (const cid of (p.data().commissionIds as string[]) ?? []) {
      wb.update(db.collection('commissions').doc(cid), { status: 'PAYABLE', payoutBatchId: null, updatedAt: now });
      wb.set(db.collection('commissionLedger').doc(), {
        commissionId: cid,
        orderId: cid,
        partnerId: p.data().partnerId,
        fromStatus: 'PROCESSING',
        toStatus: 'PAYABLE',
        amountMinor: 0,
        reason: `Payout batch ${parsed.data.batchId} cancelled; returned to payable`,
        actorId: uid,
        actorType: 'staff',
        createdAt: now,
      });
    }
    for (const eid of (p.data().earningIds as string[]) ?? []) {
      wb.update(db.collection('earnings').doc(eid), { status: 'PAYABLE', payoutBatchId: null, updatedAt: now });
      wb.set(db.collection('earningsLedger').doc(), {
        earningId: eid,
        partnerId: p.data().partnerId,
        fromStatus: 'PROCESSING',
        toStatus: 'PAYABLE',
        amountMinor: 0,
        reason: `Payout batch ${parsed.data.batchId} cancelled; returned to payable`,
        actorId: uid,
        actorType: 'staff',
        createdAt: now,
      });
    }
  }
  await wb.commit();
  await writePartnerAudit({ entityType: 'payoutBatch', entityId: parsed.data.batchId, action: 'cancel', actorId: uid, before: { status: cur }, after: { status: 'CANCELLED' } });
  return { status: 'CANCELLED' };
}

async function listPayoutBatches() {
  const snap = await db.collection('payoutBatches').orderBy('createdAt', 'desc').limit(100).get();
  return { batches: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
}

async function getPayoutBatch(body: unknown) {
  const parsed = batchIdSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const batchSnap = await db.collection('payoutBatches').doc(parsed.data.batchId).get();
  if (!batchSnap.exists) throw Err.invalidArgument('Batch not found');
  const payoutsSnap = await db.collection('payouts').where('batchId', '==', parsed.data.batchId).get();
  const payouts = await Promise.all(
    payoutsSnap.docs.map(async (d) => {
      const p = (await db.collection('partners').doc(d.data().partnerId).get()).data();
      const pd = p?.payout;
      return {
        id: d.id,
        ...d.data(),
        partnerName: (p?.displayName as string) ?? d.data().partnerId,
        payoutMethod: (pd?.method as string) ?? null,
        payoutTo:
          pd?.method === 'UPI'
            ? pd?.upiVpa ?? null
            : pd?.bankAccountNumber
              ? `${pd.accountName ?? ''} ${String(pd.bankAccountNumber).slice(-4).padStart(String(pd.bankAccountNumber).length, '•')} / ${pd.bankIfsc ?? ''}`.trim()
              : null,
      };
    }),
  );
  return { batch: { id: batchSnap.id, ...batchSnap.data() }, payouts };
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // Vercel Cron hits this endpoint with a GET and an Authorization: Bearer
  // <CRON_SECRET> header (see vercel.json "crons"). No Firebase auth here.
  if (req.method === 'GET') {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    try {
      res.status(200).json(await releaseCommissionHolds());
    } catch (err) {
      console.error('releaseCommissionHolds failed:', err);
      res.status(500).json({ error: 'Internal error' });
    }
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { action, ...data } = (req.body ?? {}) as { action?: string; [key: string]: unknown };
    const { uid, role } = await requireAdmin(req);

    // finance_admin may only reach these; a full admin may reach everything.
    const FINANCE_ADMIN_ACTIONS = new Set([
      'listPartnerCommissions',
      'holdPartnerCommission',
      'releasePartnerCommission',
      'releaseCommissionHoldsNow',
      'listPayableCommissions',
      'createPayoutBatch',
      'approvePayoutBatch',
      'recordPayoutBatchPaid',
      'cancelPayoutBatch',
      'listPayoutBatches',
      'getPayoutBatch',
      'listPartnersAdmin',
      'getPartnerKycMasked',
      'setPartnerPayoutStatus',
      'revealPartnerPan', // still gated on users/{uid}.canRevealPan inside
    ]);
    if (role === 'finance_admin' && !FINANCE_ADMIN_ACTIONS.has(String(action))) {
      throw Err.permissionDenied();
    }

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
      case 'grantTrainerStatus':
        res.status(200).json(await grantTrainerStatus(uid, data));
        return;
      case 'revokeTrainerStatus':
        res.status(200).json(await revokeTrainerStatus(uid, data));
        return;
      case 'listTrainersAdmin':
        res.status(200).json(await listTrainersAdmin());
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
      case 'getCustomExamBuilderSettings':
        res.status(200).json(await getCustomExamBuilderSettings());
        return;
      case 'updateCustomExamBuilderSettings':
        res.status(200).json(await updateCustomExamBuilderSettings(uid, data));
        return;
      case 'getFeatureAccessConfig':
        res.status(200).json(await getFeatureAccessConfig());
        return;
      case 'updateFeatureAccessConfig':
        res.status(200).json(await updateFeatureAccessConfig(uid, data));
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
      // --- Partner Commission Framework (Phase 1, staff) ---
      case 'listPartnerApplications':
        res.status(200).json(await listPartnerApplications(data));
        return;
      case 'getPartnerApplicationDetail':
        res.status(200).json(await getPartnerApplicationDetail(data));
        return;
      case 'reviewPartnerApplication':
        res.status(200).json(await reviewPartnerApplication(uid, data));
        return;
      case 'suspendPartner':
        res.status(200).json(await setPartnerStatus(uid, data, 'SUSPENDED'));
        return;
      case 'reactivatePartner':
        res.status(200).json(await setPartnerStatus(uid, data, 'ACTIVE'));
        return;
      case 'listPartnersAdmin':
        res.status(200).json(await listPartnersAdmin());
        return;
      case 'getPartnerKycMasked':
        res.status(200).json(await getPartnerKycMasked(data));
        return;
      case 'getPartnerDetail':
        res.status(200).json(await getPartnerDetail(data));
        return;
      case 'revealPartnerPan':
        res.status(200).json(await revealPartnerPan(uid, data));
        return;
      case 'setPartnerPayoutStatus':
        res.status(200).json(await setPartnerPayoutStatus(uid, data));
        return;
      case 'savePartnerProduct':
        res.status(200).json(await savePartnerProduct(uid, data));
        return;
      case 'savePartnerOffer':
        res.status(200).json(await savePartnerOffer(uid, data));
        return;
      case 'savePartnerPolicyVersion':
        res.status(200).json(await savePartnerPolicyVersion(uid, data));
        return;
      case 'getPartnerFrameworkSettings':
        res.status(200).json(await getPartnerFrameworkSettings());
        return;
      case 'savePartnerFrameworkFlags':
        res.status(200).json(await savePartnerFrameworkFlags(uid, data));
        return;
      // --- Partner Commission Framework (Phase 2, staff) ---
      case 'listPartnerCommissions':
        res.status(200).json(await listPartnerCommissions(data));
        return;
      case 'holdPartnerCommission':
        res.status(200).json(await setCommissionHold(uid, data, true));
        return;
      case 'releasePartnerCommission':
        res.status(200).json(await setCommissionHold(uid, data, false));
        return;
      case 'releaseCommissionHoldsNow':
        res.status(200).json(await releaseCommissionHolds());
        return;
      // --- Partner payouts (Phase 3, manual) ---
      case 'listPayableCommissions':
        res.status(200).json(await listPayableCommissions());
        return;
      case 'createPayoutBatch':
        res.status(200).json(await createPayoutBatch(uid, data));
        return;
      case 'approvePayoutBatch':
        res.status(200).json(await approvePayoutBatch(uid, data));
        return;
      case 'recordPayoutBatchPaid':
        res.status(200).json(await recordPayoutBatchPaid(uid, data));
        return;
      case 'cancelPayoutBatch':
        res.status(200).json(await cancelPayoutBatch(uid, data));
        return;
      case 'listPayoutBatches':
        res.status(200).json(await listPayoutBatches());
        return;
      case 'getPayoutBatch':
        res.status(200).json(await getPayoutBatch(data));
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
