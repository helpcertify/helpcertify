import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
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

// Refer & Earn — defaults match what was previously hardcoded in
// api/auth.ts's linkReferral (referee) and api/checkout.ts's/
// api/razorpay-webhook.ts's grantReferralRewardIfEligible (referrer),
// applied whenever appSettings/general doesn't have these fields yet (every
// doc that predates this admin control) so behavior doesn't silently
// change for anyone until an admin actually saves new values.
const REFERRAL_DEFAULTS = {
  referrerRewardType: 'flat' as const,
  referrerRewardValue: 50000, // ₹500, in paise
  refereeRewardType: 'flat' as const,
  refereeRewardValue: 20000, // ₹200, in paise
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
    referrerRewardType: data?.referrerRewardType ?? REFERRAL_DEFAULTS.referrerRewardType,
    referrerRewardValue: data?.referrerRewardValue ?? REFERRAL_DEFAULTS.referrerRewardValue,
    refereeRewardType: data?.refereeRewardType ?? REFERRAL_DEFAULTS.refereeRewardType,
    refereeRewardValue: data?.refereeRewardValue ?? REFERRAL_DEFAULTS.refereeRewardValue,
  };
}

// discountValue: flat is paise (same convention as CouponDoc/createCoupon);
// percent is capped at 95 — same reasoning as api/coupons.ts's own cap (a
// 100% coupon would zero out the order Razorpay needs a positive amount for).
const rewardSchema = z
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
  referrerReward: rewardSchema,
  refereeReward: rewardSchema,
});

async function updateAppSettings(uid: string, body: unknown) {
  const parsed = updateAppSettingsSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const d = parsed.data;

  await db.collection('appSettings').doc('general').set(
    {
      emailOtpEnabled: d.emailOtpEnabled,
      mobileOtpEnabled: false,
      referrerRewardType: d.referrerReward.type,
      referrerRewardValue: d.referrerReward.value,
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
    description: `Set email OTP verification to ${d.emailOtpEnabled ? 'on' : 'off'}; referrer reward ${d.referrerReward.type === 'flat' ? `₹${d.referrerReward.value / 100}` : `${d.referrerReward.value}%`}, referee reward ${d.refereeReward.type === 'flat' ? `₹${d.refereeReward.value / 100}` : `${d.refereeReward.value}%`}`,
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
      case 'listUsersAdmin':
        res.status(200).json(await listUsersAdmin());
        return;
      case 'getUserDetailAdmin':
        res.status(200).json(await getUserDetailAdmin(data));
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
