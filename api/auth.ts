import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { createHash, randomInt, randomBytes } from 'node:crypto';
import { z } from 'zod';

// Replaces functions/src/_migrated-v1-reference/register.ts + provision-profile.ts.
// Self-contained — Vercel's per-function bundler for this project has no
// support for local cross-file imports between api/*.ts files (confirmed via
// three separate failed live deploys — see the project's
// vercel-function-constraints memory), so every function file duplicates its
// own Admin SDK init / auth-guard / helpers rather than importing shared code.

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
  invalidArgument: (m: string, details?: unknown) => new HttpError(422, m, details),
  conflict: (m: string) => new HttpError(409, m),
};

// Only students self-register here. Admin accounts are created via
// admin.ts's createAdminAccount action (by an existing admin) — never
// self-service, same policy the v1 register.ts already had.
const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
  // Refer & Earn — a code carried from a "?ref=" link, never a form field
  // the learner types themselves. See linkReferral below.
  referralCode: z.string().trim().min(1).max(20).optional(),
});

interface FirebaseAuthError {
  code?: string;
}

// OTP codes expire 10 minutes after being (re)sent; a resend is throttled to
// once per 30 seconds to keep someone from hammering the Resend API (and
// their own inbox) via repeated clicks.
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 30 * 1000;
const OTP_MAX_ATTEMPTS = 5;

function hashOtpCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

// Resend's REST API directly via fetch rather than the `resend` npm
// package — avoids adding a dependency for what's a single POST call, and
// matches how Razorpay/Firebase are already called from api/*.ts (plain
// HTTP, no SDK). `verify.helpcertify.com` is the domain verified in the
// Resend dashboard for this project.
async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured');

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Helpcertify <no-reply@verify.helpcertify.com>', to: [to], subject, html }),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`Resend request failed (${resp.status}): ${detail}`);
  }
}

function otpEmailHtml(name: string, code: string): string {
  return `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
    <h2 style="color:#155EEF">Verify your email</h2>
    <p>Hi ${name},</p>
    <p>Your Helpcertify verification code is:</p>
    <p style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#0F172A">${code}</p>
    <p style="color:#64748B;font-size:14px">This code expires in 10 minutes. If you didn't request this, you can ignore this email.</p>
  </div>`;
}

// Shared by register() and resendEmailOtp() — generates a fresh 6-digit
// code, stores only its hash (same reasoning as never storing a plaintext
// password), and emails the plaintext code to the user.
async function issueEmailOtp(uid: string, email: string, name: string): Promise<void> {
  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
  await db.collection('emailOtps').doc(uid).set({
    codeHash: hashOtpCode(code),
    expiresAt: Timestamp.fromMillis(Date.now() + OTP_TTL_MS),
    attempts: 0,
    lastSentAt: FieldValue.serverTimestamp(),
  });
  await sendEmail(email, 'Your Helpcertify verification code', otpEmailHtml(name, code));
}

// Refer & Earn — 6 uppercase base32-ish characters (Crockford's alphabet,
// no 0/O/1/I ambiguity), generated from crypto randomness. Collisions are
// astronomically unlikely at this length (same "don't bother checking"
// precedent as content-admin.ts's generateCode for quiz access codes), so
// this doesn't loop/retry on a lookup.
const REFERRAL_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function generateReferralCode(): string {
  const bytes = randomBytes(6);
  let code = '';
  for (const b of bytes) code += REFERRAL_CODE_ALPHABET[b % REFERRAL_CODE_ALPHABET.length];
  return code;
}

// The referee's own welcome coupon's code — "CERTI" (Helpcertify) plus 4
// characters from the same clean alphabet as generateReferralCode above,
// e.g. "CERTIX7K2" (9 characters total, short enough to type by hand and
// read as belonging to this app).
function generateWelcomeCouponCode(): string {
  const bytes = randomBytes(4);
  let suffix = '';
  for (const b of bytes) suffix += REFERRAL_CODE_ALPHABET[b % REFERRAL_CODE_ALPHABET.length];
  return `CERTI${suffix}`;
}

// Refer & Earn — the new user's own welcome coupon, granted immediately at
// signup (not gated on a purchase like the referrer's reward is) since it
// exists to encourage that very first purchase, not reward one that
// already happened. Type/value are admin-configurable (see
// api/admin.ts's getAppSettings/updateAppSettings) rather than hardcoded;
// these are only the fallback for a doc that predates that control. A
// shorter expiry than the referrer's reward, matching a "use it soon"
// welcome offer rather than a standing one.
const REFEREE_REWARD_DEFAULTS = { type: 'flat' as const, value: 20000 }; // ₹200, in paise
const REFEREE_COUPON_EXPIRY_DAYS = 30;

interface ReferralLinkResult {
  referrerUid: string;
  refereeCoupon: { code: string; type: 'flat' | 'percent'; value: number };
}

// Shared by register() and provisionProfile() — resolves an optional
// referral code (from a "?ref=" link) to its owner and, if found, writes
// the referrals/{newUid} doc (referrer's reward starts 'pending'; the new
// user's own welcome coupon is minted right here, already redeemable).
// Never throws on a bad/expired/unknown code — an invalid referral link
// should never block someone from signing up, it should just silently not
// attribute a referral. Returns undefined when there's nothing to link.
async function linkReferral(
  newUid: string,
  newUserName: string,
  referralCode: string | undefined
): Promise<ReferralLinkResult | undefined> {
  if (!referralCode) return undefined;
  const referrerSnap = await db.collection('users').where('referralCode', '==', referralCode.trim().toUpperCase()).limit(1).get();
  if (referrerSnap.empty) return undefined;
  const referrerUid = referrerSnap.docs[0].id;
  if (referrerUid === newUid) return undefined; // can't happen in practice (a brand-new account has no code yet), but never trust it

  const settingsSnap = await db.collection('appSettings').doc('general').get();
  const settings = settingsSnap.data();
  const rewardType: 'flat' | 'percent' = settings?.refereeRewardType ?? REFEREE_REWARD_DEFAULTS.type;
  const rewardValue: number = settings?.refereeRewardValue ?? REFEREE_REWARD_DEFAULTS.value;

  const refereeCouponCode = generateWelcomeCouponCode();
  await db.collection('coupons').doc(refereeCouponCode).set({
    discountType: rewardType,
    discountValue: rewardValue,
    active: true,
    expiresAt: Timestamp.fromMillis(Date.now() + REFEREE_COUPON_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
    maxUses: 1,
    usedCount: 0,
    restrictedToUserId: newUid,
    createdBy: 'system_referral',
    createdAt: Timestamp.now(),
  });

  await db.collection('referrals').doc(newUid).set({
    referrerUid,
    refereeUid: newUid,
    refereeName: newUserName,
    status: 'pending',
    couponCode: null,
    rewardType: null,
    rewardValue: null,
    refereeCouponCode,
    refereeRewardType: rewardType,
    refereeRewardValue: rewardValue,
    createdAt: FieldValue.serverTimestamp(),
    rewardedAt: null,
  });
  return { referrerUid, refereeCoupon: { code: refereeCouponCode, type: rewardType, value: rewardValue } };
}

async function register(body: unknown) {
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { name, email, password, referralCode } = parsed.data;

  let uid: string;
  try {
    const userRecord = await adminAuth.createUser({ email, password, displayName: name });
    uid = userRecord.uid;
  } catch (err) {
    if ((err as FirebaseAuthError).code === 'auth/email-already-exists') {
      throw Err.conflict('An account with this email already exists');
    }
    throw err;
  }

  const settingsSnap = await db.collection('appSettings').doc('general').get();
  const emailOtpEnabled = settingsSnap.data()?.emailOtpEnabled === true;

  // Refer & Earn — resolved before the user doc is written so referredBy
  // can be set in the same call rather than a second write.
  const referralResult = await linkReferral(uid, name, referralCode);

  // Role lives only on the Firestore doc below, not an ID-token custom claim
  // — see api/admin.ts's requireAdmin for why (it's what lets an admin be
  // created straight from the Firebase Console, no Admin SDK code needed).
  const now = FieldValue.serverTimestamp();
  await db.collection('users').doc(uid).set({
    name,
    email,
    role: 'student',
    avatarUrl: null,
    isActive: true,
    // Grandfathered true whenever email OTP isn't turned on — only actually
    // gates anything (see ProtectedRoute) when it's explicitly false.
    emailVerified: !emailOtpEnabled,
    referredBy: referralResult?.referrerUid,
    createdAt: now,
    updatedAt: now,
  });

  if (emailOtpEnabled) {
    await issueEmailOtp(uid, email, name);
  }

  return { uid, otpRequired: emailOtpEnabled, welcomeCoupon: referralResult?.refereeCoupon ?? null };
}

const verifyEmailOtpSchema = z.object({ code: z.string().trim().length(6) });

async function verifyEmailOtp(req: VercelRequest, body: unknown) {
  const token = await requireIdToken(req);
  let uid: string;
  try {
    ({ uid } = await adminAuth.verifyIdToken(token));
  } catch {
    throw Err.unauthenticated('Invalid or expired token');
  }

  const parsed = verifyEmailOtpSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);

  const otpRef = db.collection('emailOtps').doc(uid);
  const otpSnap = await otpRef.get();
  if (!otpSnap.exists) throw Err.invalidArgument('No pending verification for this account. Request a new code.');
  const otp = otpSnap.data()!;

  if ((otp.attempts ?? 0) >= OTP_MAX_ATTEMPTS) {
    await otpRef.delete();
    throw Err.invalidArgument('Too many incorrect attempts. Request a new code.');
  }
  if ((otp.expiresAt as Timestamp).toMillis() < Date.now()) {
    throw Err.invalidArgument('This code has expired. Request a new one.');
  }
  if (hashOtpCode(parsed.data.code) !== otp.codeHash) {
    await otpRef.update({ attempts: FieldValue.increment(1) });
    throw Err.invalidArgument('Incorrect code. Please try again.');
  }

  await Promise.all([
    db.collection('users').doc(uid).update({ emailVerified: true, updatedAt: FieldValue.serverTimestamp() }),
    otpRef.delete(),
  ]);
  return { success: true };
}

async function resendEmailOtp(req: VercelRequest) {
  const token = await requireIdToken(req);
  let uid: string;
  try {
    ({ uid } = await adminAuth.verifyIdToken(token));
  } catch {
    throw Err.unauthenticated('Invalid or expired token');
  }

  const userSnap = await db.collection('users').doc(uid).get();
  const user = userSnap.data();
  if (!userSnap.exists || !user) throw Err.unauthenticated('Account not found');
  if (user.emailVerified === true) throw Err.conflict('This account is already verified');

  const otpSnap = await db.collection('emailOtps').doc(uid).get();
  const lastSentAt = otpSnap.data()?.lastSentAt as Timestamp | undefined;
  if (lastSentAt && Date.now() - lastSentAt.toMillis() < OTP_RESEND_COOLDOWN_MS) {
    throw Err.conflict('Please wait a moment before requesting another code');
  }

  await issueEmailOtp(uid, user.email as string, user.name as string);
  return { success: true };
}

async function requireIdToken(req: VercelRequest): Promise<string> {
  const authHeader = req.headers.authorization ?? '';
  const token = (Array.isArray(authHeader) ? authHeader[0] : authHeader).replace(/^Bearer\s+/i, '');
  if (!token) throw Err.unauthenticated();
  return token;
}

// Google sign-in creates the Firebase Auth account client-side directly
// (signInWithPopup) — nothing provisions the Firestore profile or the role
// claim unless something explicitly does it after. authApi.signInWithGoogle()
// calls this every time (new or returning user); idempotent — only writes on
// an account's actual first sign-in.
const provisionProfileSchema = z.object({
  // Refer & Earn — see registerSchema's own referralCode comment; same
  // "?ref=" link, carried through Google sign-in too.
  referralCode: z.string().trim().min(1).max(20).optional(),
});

async function provisionProfile(req: VercelRequest, body: unknown) {
  const token = await requireIdToken(req);
  let uid: string;
  try {
    ({ uid } = await adminAuth.verifyIdToken(token));
  } catch {
    throw Err.unauthenticated('Invalid or expired token');
  }

  const userRef = db.collection('users').doc(uid);
  const existing = await userRef.get();
  if (existing.exists) return { provisioned: false };

  const parsed = provisionProfileSchema.safeParse(body ?? {});
  const referralCode = parsed.success ? parsed.data.referralCode : undefined;

  const userRecord = await adminAuth.getUser(uid);
  const name = userRecord.displayName ?? userRecord.email?.split('@')[0] ?? 'New user';

  // Refer & Earn — resolved before the user doc is written so referredBy
  // can be set in the same call rather than a second write.
  const referralResult = await linkReferral(uid, name, referralCode);

  const now = FieldValue.serverTimestamp();
  await userRef.set({
    name,
    email: userRecord.email ?? '',
    role: 'student',
    avatarUrl: userRecord.photoURL ?? null,
    isActive: true,
    // Google already verifies the address via OAuth — never OTP-gated,
    // regardless of the emailOtpEnabled setting.
    emailVerified: true,
    referredBy: referralResult?.referrerUid,
    createdAt: now,
    updatedAt: now,
  });

  return { provisioned: true, welcomeCoupon: referralResult?.refereeCoupon ?? null };
}

// Generic (headline/bio/website), not institution-specific — matches
// ProfilePage already dropping the old department/year fields for the
// same reason: this platform isn't scoped to students at one school.
const updateProfileSchema = z.object({
  headline: z.string().trim().max(100).nullable().optional(),
  bio: z.string().trim().max(1000).nullable().optional(),
});

async function updateProfile(req: VercelRequest, body: unknown) {
  const token = await requireIdToken(req);
  let uid: string;
  try {
    ({ uid } = await adminAuth.verifyIdToken(token));
  } catch {
    throw Err.unauthenticated('Invalid or expired token');
  }

  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);

  await db.collection('users').doc(uid).update({ ...parsed.data, updatedAt: FieldValue.serverTimestamp() });
  return { success: true };
}

// Refer & Earn — backfills a referral code for an account that predates
// this feature (every account created after it gets one lazily here too,
// the first time they open My Profile, rather than needing every existing
// signup path to be touched). Idempotent: returns the existing code
// untouched if one's already set.
async function ensureReferralCode(req: VercelRequest) {
  const token = await requireIdToken(req);
  let uid: string;
  try {
    ({ uid } = await adminAuth.verifyIdToken(token));
  } catch {
    throw Err.unauthenticated('Invalid or expired token');
  }

  const userRef = db.collection('users').doc(uid);
  const snap = await userRef.get();
  if (!snap.exists) throw Err.unauthenticated('Account not found');
  const existingCode = snap.data()?.referralCode as string | undefined;
  if (existingCode) return { referralCode: existingCode };

  const referralCode = generateReferralCode();
  await userRef.update({ referralCode, updatedAt: FieldValue.serverTimestamp() });
  return { referralCode };
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { action, ...data } = (req.body ?? {}) as { action?: string; [key: string]: unknown };

    switch (action) {
      case 'register':
        res.status(200).json(await register(data));
        return;
      case 'provisionProfile':
        res.status(200).json(await provisionProfile(req, data));
        return;
      case 'updateProfile':
        res.status(200).json(await updateProfile(req, data));
        return;
      case 'verifyEmailOtp':
        res.status(200).json(await verifyEmailOtp(req, data));
        return;
      case 'resendEmailOtp':
        res.status(200).json(await resendEmailOtp(req));
        return;
      case 'ensureReferralCode':
        res.status(200).json(await ensureReferralCode(req));
        return;
      default:
        throw Err.invalidArgument(`Unknown action: ${String(action)}`);
    }
  } catch (err) {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message, details: err.details });
      return;
    }
    console.error('auth handler error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
}
