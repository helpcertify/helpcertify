import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { createHash, createHmac, randomInt, randomBytes } from 'node:crypto';
import { z } from 'zod';

// Replaces functions/src/_migrated-v1-reference/register.ts + provision-profile.ts.
// Self-contained - Vercel's per-function bundler for this project has no
// support for local cross-file imports between api/*.ts files (confirmed via
// three separate failed live deploys - see the project's
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
// admin.ts's createAdminAccount action (by an existing admin) - never
// self-service, same policy the v1 register.ts already had.
const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
  // Refer & Earn - a code carried from a "?ref=" link, never a form field
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
// package - avoids adding a dependency for what's a single POST call, and
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

// Shared by register() and resendEmailOtp() - generates a fresh 6-digit
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

// Refer & Earn - 6 uppercase base32-ish characters (Crockford's alphabet,
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

// The referee's own welcome coupon's code - "CERTI" (Helpcertify) plus 4
// characters from the same clean alphabet as generateReferralCode above,
// e.g. "CERTIX7K2" (9 characters total, short enough to type by hand and
// read as belonging to this app).
function generateWelcomeCouponCode(): string {
  const bytes = randomBytes(4);
  let suffix = '';
  for (const b of bytes) suffix += REFERRAL_CODE_ALPHABET[b % REFERRAL_CODE_ALPHABET.length];
  return `CERTI${suffix}`;
}

// Standard Vercel idiom for the client's IP - same defensive
// array-or-string handling already used for the authorization header
// below. Used only for the Refer & Earn same-signup-IP fraud check (see
// isSameSignupIp); never anything security-sensitive on its own.
function getClientIp(req: VercelRequest): string | null {
  const header = req.headers['x-forwarded-for'];
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return null;
  return raw.split(',')[0]?.trim() || null;
}

// Mirrors src/features/students/lib/referralRules.ts's isSelfReferral /
// isSameSignupIp - that module is the tested, canonical version; these
// are duplicated inline since api/*.ts files can't import across each
// other or from src/ (see this file's header comment).
function isSelfReferral(referrerUid: string, newUid: string): boolean {
  return referrerUid === newUid;
}
function isSameSignupIp(referrerSignupIp: string | null | undefined, newSignupIp: string | null | undefined): boolean {
  if (!referrerSignupIp || !newSignupIp) return false;
  return referrerSignupIp === newSignupIp;
}

// Refer & Earn - the new user's own welcome coupon, granted immediately at
// signup (not gated on a purchase like the referrer's reward is) since it
// exists to encourage that very first purchase, not reward one that
// already happened. Type/value are admin-configurable (see
// api/admin.ts's getAppSettings/updateAppSettings) rather than hardcoded;
// these are only the fallback for a doc that predates that control. A
// shorter expiry than the referrer's reward, matching a "use it soon"
// welcome offer rather than a standing one. Default is 10% off (not a
// flat amount) per the current spec.
const REFEREE_REWARD_DEFAULTS = { type: 'percent' as const, value: 10 };
const REFEREE_COUPON_EXPIRY_DAYS = 30;

interface ReferralLinkResult {
  referrerUid: string;
  refereeCoupon: { code: string; type: 'flat' | 'percent'; value: number };
}

// A referral doc that was rejected for a fraud reason (self-referral,
// same signup IP) is still written - status 'rejected' with a reason -
// so it's visible in the admin audit view (item 15), unlike a merely
// unknown/mistyped code, which stays silent (that's a typo, not fraud;
// see linkReferral below).
async function writeRejectedReferral(
  refereeUid: string,
  refereeName: string,
  referrerUid: string,
  rejectionReason: string
): Promise<void> {
  await db.collection('referrals').doc(refereeUid).set({
    referrerUid,
    refereeUid,
    refereeName,
    status: 'rejected',
    rejectionReason,
    qualifyingOrderId: null,
    creditEntryId: null,
    refereeCouponCode: null,
    refereeRewardType: null,
    refereeRewardValue: null,
    createdAt: FieldValue.serverTimestamp(),
    rewardedAt: null,
  });
}

// Shared by register(), provisionProfile(), and applyReferralCode() -
// resolves a referral code (from a "?ref=" link, or entered later on My
// Profile) to its owner and, if eligible, writes the referrals/{newUid}
// doc (status 'registered'; the new user's own welcome coupon is minted
// right here, already redeemable). Never throws on a bad/unknown code -
// that's a typo, not fraud, so it should never block signing up or
// applying a code; it just silently returns undefined. Self-referral and
// same-signup-IP *are* recorded as a 'rejected' referral doc (item 12) -
// still doesn't throw, since account creation itself is never blocked
// over this, only the referral link.
async function linkReferral(
  newUid: string,
  newUserName: string,
  referralCode: string | undefined,
  newSignupIp: string | null
): Promise<ReferralLinkResult | undefined> {
  if (!referralCode) return undefined;
  const referrerSnap = await db.collection('users').where('referralCode', '==', referralCode.trim().toUpperCase()).limit(1).get();
  if (referrerSnap.empty) return undefined;
  const referrerUid = referrerSnap.docs[0].id;
  const referrerData = referrerSnap.docs[0].data();

  if (isSelfReferral(referrerUid, newUid)) {
    await writeRejectedReferral(newUid, newUserName, referrerUid, 'Self-referral');
    return undefined;
  }
  if (isSameSignupIp(referrerData.signupIp as string | undefined, newSignupIp)) {
    await writeRejectedReferral(newUid, newUserName, referrerUid, 'Same signup IP as referrer');
    return undefined;
  }

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
    status: 'registered',
    rejectionReason: null,
    qualifyingOrderId: null,
    creditEntryId: null,
    refereeCouponCode,
    refereeRewardType: rewardType,
    refereeRewardValue: rewardValue,
    createdAt: FieldValue.serverTimestamp(),
    rewardedAt: null,
  });
  return { referrerUid, refereeCoupon: { code: refereeCouponCode, type: rewardType, value: rewardValue } };
}

async function register(req: VercelRequest, body: unknown) {
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
  const signupIp = getClientIp(req);

  // Refer & Earn - resolved before the user doc is written so referredBy
  // can be set in the same call rather than a second write.
  const referralResult = await linkReferral(uid, name, referralCode, signupIp);

  // Role lives only on the Firestore doc below, not an ID-token custom claim
  // - see api/admin.ts's requireAdmin for why (it's what lets an admin be
  // created straight from the Firebase Console, no Admin SDK code needed).
  const now = FieldValue.serverTimestamp();
  await db.collection('users').doc(uid).set({
    name,
    email,
    role: 'student',
    avatarUrl: null,
    isActive: true,
    // Grandfathered true whenever email OTP isn't turned on - only actually
    // gates anything (see ProtectedRoute) when it's explicitly false.
    emailVerified: !emailOtpEnabled,
    referredBy: referralResult?.referrerUid,
    signupIp,
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
// (signInWithPopup) - nothing provisions the Firestore profile or the role
// claim unless something explicitly does it after. authApi.signInWithGoogle()
// calls this every time (new or returning user); idempotent - only writes on
// an account's actual first sign-in.
const provisionProfileSchema = z.object({
  // Refer & Earn - see registerSchema's own referralCode comment; same
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
  const signupIp = getClientIp(req);

  // Refer & Earn - resolved before the user doc is written so referredBy
  // can be set in the same call rather than a second write.
  const referralResult = await linkReferral(uid, name, referralCode, signupIp);

  const now = FieldValue.serverTimestamp();
  await userRef.set({
    name,
    email: userRecord.email ?? '',
    role: 'student',
    avatarUrl: userRecord.photoURL ?? null,
    isActive: true,
    // Google already verifies the address via OAuth - never OTP-gated,
    // regardless of the emailOtpEnabled setting.
    emailVerified: true,
    referredBy: referralResult?.referrerUid,
    signupIp,
    createdAt: now,
    updatedAt: now,
  });

  return { provisioned: true, welcomeCoupon: referralResult?.refereeCoupon ?? null };
}

// Generic (headline/bio/website), not institution-specific - matches
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

// Refer & Earn - backfills a referral code for an account that predates
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

const applyReferralCodeSchema = z.object({ referralCode: z.string().trim().min(1).max(20) });

// Refer & Earn - item 4/5 of the spec: a code doesn't have to be entered
// only at registration, it can be applied any time up until this
// account's first purchase. Reuses linkReferral's exact eligibility/fraud
// logic; the only thing added here is the "haven't purchased anything
// yet" gate and "don't already have a referral linked" gate, both of
// which register()/provisionProfile() get for free (a referral can only
// ever be created once per uid, and a purchase can't happen before an
// account exists).
async function applyReferralCode(req: VercelRequest, body: unknown) {
  const token = await requireIdToken(req);
  let uid: string;
  try {
    ({ uid } = await adminAuth.verifyIdToken(token));
  } catch {
    throw Err.unauthenticated('Invalid or expired token');
  }

  const parsed = applyReferralCodeSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);

  const existingReferral = await db.collection('referrals').doc(uid).get();
  if (existingReferral.exists) {
    return { success: false as const, reason: 'A referral code has already been applied to this account.' };
  }

  const purchasesSnap = await db.collection('purchases').where('userId', '==', uid).limit(1).get();
  if (!purchasesSnap.empty) {
    return { success: false as const, reason: "This account has already made a purchase, so it's no longer eligible for a referral code." };
  }

  const userSnap = await db.collection('users').doc(uid).get();
  const user = userSnap.data();
  if (!user) throw Err.unauthenticated('Account not found');

  const signupIp = (user.signupIp as string | undefined) ?? null;
  const referralResult = await linkReferral(uid, user.name as string, parsed.data.referralCode, signupIp);
  if (!referralResult) {
    // Covers both an unknown code and a fraud rejection (self-referral /
    // same signup IP) - linkReferral already recorded the latter as a
    // 'rejected' referral doc for the audit trail; either way, nothing
    // here for this account to redeem.
    return { success: false as const, reason: 'That referral code could not be applied.' };
  }

  await db.collection('users').doc(uid).update({ referredBy: referralResult.referrerUid, updatedAt: FieldValue.serverTimestamp() });
  return { success: true as const, welcomeCoupon: referralResult.refereeCoupon };
}

// ===========================================================================
// Partner Commission Framework - Phase 1 (user / partner / public actions).
// Folded in here rather than a new api/partner.ts because Vercel Hobby caps
// this project at 12 function files and a 13th fails to deploy (confirmed
// again 2026-09-03, Fluid Compute included - see the vercel-hobby-function-cap
// memory). This file already owns referral-code generation, getClientIp, and
// an unauthenticated action (register), so it's the natural home. Staff-only
// partner actions live in api/admin.ts.
//
// The pure specs these mirror: src/features/partner/lib/{referralCode,
// partnerEligibility,attributionToken,auditEvent}.ts (tested; can't be
// imported here - no cross-file / src imports in api/*).
// ===========================================================================

const PARTNER_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const PARTNER_CODE_RE = new RegExp(`^HCP[${PARTNER_CODE_ALPHABET}]{6}$`);
const PARTNER_AGREEMENT_VERSION = '2026-09-03';
const REF_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 45; // 45 days - covers the 30-day attribution window with slack

function generatePartnerCode(): string {
  const bytes = randomBytes(6);
  let body = '';
  for (const b of bytes) body += PARTNER_CODE_ALPHABET[b % PARTNER_CODE_ALPHABET.length];
  return `HCP${body}`;
}

// Minimal audit-field redactor (mirrors src/features/partner/lib/auditEvent.ts).
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
  actorType: 'staff' | 'partner' | 'system' | 'customer';
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}) {
  await db.collection('auditEvents').add({
    entityType: args.entityType,
    entityId: args.entityId,
    action: args.action,
    actorId: args.actorId,
    actorType: args.actorType,
    before: args.before === undefined ? null : redactForAudit(args.before),
    after: args.after === undefined ? null : redactForAudit(args.after),
    reason: args.reason ?? null,
    correlationId: null,
    createdAt: FieldValue.serverTimestamp(),
  });
}

function signRefToken(payload: { code: string; partnerId: string; productId: string; exp: number }): string | null {
  const secret = process.env.PARTNER_TOKEN_SECRET;
  if (!secret) return null;
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

// --- public: resolve a ?ref= code, hand back an opaque signed token ---
const resolvePartnerReferralSchema = z.object({
  code: z.string().trim().min(1).max(20),
  productId: z.string().trim().min(1).max(40).default('HELPCERTIFY'),
  landingPath: z.string().trim().max(300).optional(),
});

async function resolvePartnerReferral(req: VercelRequest, body: unknown) {
  const parsed = resolvePartnerReferralSchema.safeParse(body);
  if (!parsed.success) return { valid: false as const };
  const { productId, landingPath } = parsed.data;
  const code = parsed.data.code.trim().toUpperCase();
  if (!PARTNER_CODE_RE.test(code)) return { valid: false as const };

  const codeSnap = await db.collection('referralCodes').doc(code).get();
  const codeData = codeSnap.data();
  if (!codeSnap.exists || codeData?.active !== true || codeData.productId !== productId) {
    return { valid: false as const };
  }
  const partnerSnap = await db.collection('partners').doc(codeData.partnerId as string).get();
  if (!partnerSnap.exists || partnerSnap.data()?.status !== 'ACTIVE') {
    return { valid: false as const };
  }

  // Log the visit (best-effort; a failed write must not fail resolution).
  const ip = getClientIp(req);
  const ua = Array.isArray(req.headers['user-agent']) ? req.headers['user-agent'][0] : req.headers['user-agent'];
  await db
    .collection('referralEvents')
    .add({
      code,
      productId,
      ipHash: ip ? createHash('sha256').update(ip).digest('hex') : null,
      uaHash: ua ? createHash('sha256').update(ua).digest('hex') : null,
      landingPath: landingPath ?? null,
      createdAt: FieldValue.serverTimestamp(),
    })
    .catch((e) => console.error('referralEvents write failed:', e));

  const token = signRefToken({
    code,
    partnerId: codeData.partnerId as string,
    productId,
    exp: Math.floor(Date.now() / 1000) + REF_TOKEN_TTL_SECONDS,
  });
  return { valid: true as const, token };
}

// --- authed user: submit a partner application ---
// PAN (PRD 6): AAAAA9999A. GSTIN carries the PAN in positions 3-12.
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;
const normPan = (v: string) => v.trim().toUpperCase().replace(/\s+/g, '');
const maskPanFull = (p: string) => (PAN_RE.test(p) ? `${p.slice(0, 5)}****${p.slice(9)}` : '****');

const submitPartnerApplicationSchema = z.object({
  legalName: z.string().trim().min(2).max(120),
  displayName: z.string().trim().min(2).max(60),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use yyyy-mm-dd'),
  phone: z.string().trim().min(6).max(20),
  partnerType: z.enum(['referral', 'sales', 'implementation', 'agency']),
  country: z.string().trim().length(2).toUpperCase().default('IN'),
  addressLine: z.string().trim().min(4).max(200),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  postalCode: z.string().trim().min(3).max(12),
  pan: z.string().trim().max(12).optional(),
  panName: z.string().trim().max(120).optional(),
  gstin: z.string().trim().max(20).optional(),
  acceptAgreement: z.literal(true),
  // A distinct acknowledgement for PAN processing (PRD 6.PAN legal position).
  panConsent: z.boolean().optional(),
});

function ageInYears(dob: string, now: Date): number {
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return NaN;
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age;
}

async function submitPartnerApplication(req: VercelRequest, body: unknown) {
  const token = await requireIdToken(req);
  let uid: string;
  try {
    ({ uid } = await adminAuth.verifyIdToken(token));
  } catch {
    throw Err.unauthenticated('Invalid or expired token');
  }
  const flagSnap = await db.collection('appSettings').doc('partnerFramework').get();
  if (flagSnap.data()?.applicationsOpen !== true) {
    throw new HttpError(409, 'Partner applications are not open right now.');
  }
  const parsed = submitPartnerApplicationSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const d = parsed.data;
  if (!(ageInYears(d.dateOfBirth, new Date()) >= 18)) {
    throw Err.invalidArgument('You must be at least 18 to become a payout partner.');
  }

  // PAN is mandatory for an India-based earning partner (PRD 6 + 23).
  const requiresPan = d.country === 'IN';
  const pan = d.pan ? normPan(d.pan) : '';
  if (requiresPan) {
    if (!pan) throw Err.invalidArgument('PAN is required for an India-based partner.');
    if (!PAN_RE.test(pan)) throw Err.invalidArgument('That PAN is not in a valid format (AAAAA9999A).');
    if (d.panConsent !== true) {
      throw Err.invalidArgument('Please acknowledge how your PAN will be used before submitting.');
    }
  }
  let gstin = '';
  if (d.gstin) {
    gstin = d.gstin.trim().toUpperCase().replace(/\s+/g, '');
    if (!GSTIN_RE.test(gstin)) throw Err.invalidArgument('That GSTIN is not in a valid format.');
    if (pan && gstin.slice(2, 12) !== pan) {
      throw Err.invalidArgument('The GSTIN and PAN do not match.');
    }
  }

  const existing = await db
    .collection('partnerApplications')
    .where('userId', '==', uid)
    .where('status', 'in', ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED'])
    .limit(1)
    .get();
  if (!existing.empty) {
    throw new HttpError(409, 'You already have a partner application in progress.');
  }

  // Duplicate-PAN detection across live applications + approved partners.
  // Not a hard block (PRD 6: "cannot be silently accepted" - flag for review).
  let duplicatePanFlag = false;
  let panHash = '';
  if (pan) {
    panHash = createHash('sha256').update(pan).digest('hex');
    // This user has no in-flight KYC doc yet (checked existing.empty above),
    // so any hit here is a genuine other account.
    const [dupKyc, dupApp] = await Promise.all([
      db.collection('partnerKyc').where('panHash', '==', panHash).limit(1).get(),
      db.collection('partnerApplicationKyc').where('panHash', '==', panHash).limit(1).get(),
    ]);
    duplicatePanFlag = !dupKyc.empty || !dupApp.empty;
  }

  const now = FieldValue.serverTimestamp();
  const ref = db.collection('partnerApplications').doc();
  await ref.set({
    userId: uid,
    productId: 'HELPCERTIFY',
    legalName: d.legalName,
    displayName: d.displayName,
    dateOfBirth: d.dateOfBirth,
    phone: d.phone,
    partnerType: d.partnerType,
    country: d.country,
    agreementVersion: PARTNER_AGREEMENT_VERSION,
    panConsentVersion: requiresPan ? PARTNER_AGREEMENT_VERSION : null,
    panMasked: pan ? maskPanFull(pan) : null,
    panLast4: pan ? pan.slice(-4) : null,
    panStatus: pan ? 'FORMAT_VALID' : null,
    gstinMasked: gstin ? `${gstin.slice(0, 2)}****${gstin.slice(-4)}` : null,
    duplicatePanFlag,
    status: 'SUBMITTED',
    reviewedBy: null,
    reviewNote: null,
    partnerId: null,
    submittedAt: now,
    updatedAt: now,
  });

  // Full PAN / GSTIN / address -> separate deny-all collection so the
  // applicant's own read-back of their application never exposes it.
  if (pan || gstin) {
    await db
      .collection('partnerApplicationKyc')
      .doc(ref.id)
      .set({
        appId: ref.id,
        userId: uid,
        panFull: pan || null,
        panHash: panHash || null,
        panName: d.panName ?? null,
        gstin: gstin || null,
        addressLine: d.addressLine,
        city: d.city,
        state: d.state,
        postalCode: d.postalCode,
        country: d.country,
        createdAt: now,
      });
  }

  await writePartnerAudit({
    entityType: 'partnerApplication',
    entityId: ref.id,
    action: 'submit',
    actorId: uid,
    actorType: 'customer',
    // redactForAudit strips pan* / gstin keys; masked mirror is safe.
    after: { partnerType: d.partnerType, displayName: d.displayName, country: d.country, panMasked: pan ? maskPanFull(pan) : null, duplicatePanFlag },
  });
  return { applicationId: ref.id, status: 'SUBMITTED' as const };
}

async function getMyPartnerApplication(req: VercelRequest) {
  const token = await requireIdToken(req);
  let uid: string;
  try {
    ({ uid } = await adminAuth.verifyIdToken(token));
  } catch {
    throw Err.unauthenticated('Invalid or expired token');
  }
  const snap = await db
    .collection('partnerApplications')
    .where('userId', '==', uid)
    .orderBy('submittedAt', 'desc')
    .limit(1)
    .get();
  if (snap.empty) return { application: null };
  const a = snap.docs[0].data();
  return {
    application: {
      id: snap.docs[0].id,
      status: a.status as string,
      partnerType: a.partnerType as string,
      reviewNote: (a.reviewNote as string | null) ?? null,
      partnerId: (a.partnerId as string | null) ?? null,
    },
  };
}

// --- authed partner: mint / list own referral codes ---
async function requirePartner(req: VercelRequest): Promise<{ uid: string; partnerId: string }> {
  const token = await requireIdToken(req);
  let uid: string;
  try {
    ({ uid } = await adminAuth.verifyIdToken(token));
  } catch {
    throw Err.unauthenticated('Invalid or expired token');
  }
  const userSnap = await db.collection('users').doc(uid).get();
  const partnerId = userSnap.data()?.partnerId as string | undefined;
  if (!partnerId) throw new HttpError(403, 'This account is not an approved partner.');
  const partnerSnap = await db.collection('partners').doc(partnerId).get();
  if (partnerSnap.data()?.status !== 'ACTIVE') throw new HttpError(403, 'Your partner account is not active.');
  return { uid, partnerId };
}

async function createPartnerReferralCode(req: VercelRequest) {
  const { uid, partnerId } = await requirePartner(req);
  const partnerSnap = await db.collection('partners').doc(partnerId).get();
  const productId = (partnerSnap.data()?.productId as string) ?? 'HELPCERTIFY';
  let code = generatePartnerCode();
  // one retry on the astronomically-unlikely collision
  if ((await db.collection('referralCodes').doc(code).get()).exists) code = generatePartnerCode();
  await db.collection('referralCodes').doc(code).set({
    partnerId,
    productId,
    offerId: null,
    active: true,
    createdAt: FieldValue.serverTimestamp(),
  });
  await writePartnerAudit({
    entityType: 'referralCode',
    entityId: code,
    action: 'create',
    actorId: uid,
    actorType: 'partner',
    after: { partnerId },
  });
  return { code };
}

async function listMyPartnerReferralCodes(req: VercelRequest) {
  const { partnerId } = await requirePartner(req);
  const snap = await db
    .collection('referralCodes')
    .where('partnerId', '==', partnerId)
    .orderBy('createdAt', 'desc')
    .get();
  return {
    codes: snap.docs.map((doc) => ({
      code: doc.id,
      active: doc.data().active === true,
      productId: doc.data().productId as string,
    })),
  };
}

// --- approved partner: my commissions (Phase 2, read-only dashboard) ---
async function listMyPartnerCommissions(req: VercelRequest) {
  const { partnerId } = await requirePartner(req);
  const snap = await db
    .collection('commissions')
    .where('partnerId', '==', partnerId)
    .orderBy('createdAt', 'desc')
    .limit(200)
    .get();

  const commissions = snap.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      orderId: d.orderId as string,
      status: d.status as string,
      currency: (d.currency as string) ?? 'INR',
      eligibleBaseMinor: Number(d.eligibleBaseMinor) || 0,
      grossCommissionMinor: Number(d.grossCommissionMinor) || 0,
      netPayableMinor: Number(d.netPayableMinor) || 0,
      holdUntil: d.holdUntil ? (d.holdUntil as FirebaseFirestore.Timestamp).toDate().toISOString() : null,
      createdAt: d.createdAt ? (d.createdAt as FirebaseFirestore.Timestamp).toDate().toISOString() : null,
    };
  });

  // Money summary the dashboard shows at the top.
  const sum = (pred: (s: string) => boolean) =>
    commissions.filter((c) => pred(c.status)).reduce((t, c) => t + c.netPayableMinor, 0);
  const totals = {
    pendingMinor: sum((s) => s === 'PENDING_HOLD' || s === 'ON_HOLD' || s === 'APPROVED'),
    payableMinor: sum((s) => s === 'PAYABLE' || s === 'PROCESSING'),
    paidMinor: sum((s) => s === 'PAID'),
    reversedMinor: sum((s) => s === 'REVERSED' || s === 'RECOVERABLE'),
  };
  return { commissions, totals };
}

// --- approved partner: payout details (Phase 3). Finance needs the real
// values to pay by hand (no RazorpayX in the MVP); stored on partners/{id}
// .payout, denied to other clients by rules, and stripped from every audit
// doc by redactForAudit. ---
const savePartnerPayoutSchema = z
  .object({
    method: z.enum(['BANK', 'UPI']),
    accountName: z.string().trim().min(2).max(120),
    bankAccountNumber: z.string().trim().regex(/^\d{6,20}$/).optional(),
    bankIfsc: z.string().trim().regex(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/).optional(),
    upiVpa: z.string().trim().regex(/^[\w.\-]{2,64}@[\w.\-]{2,32}$/).optional(),
    pan: z.string().trim().regex(/^[A-Za-z]{5}\d{4}[A-Za-z]$/).optional(),
  })
  .refine((d) => (d.method === 'BANK' ? !!d.bankAccountNumber && !!d.bankIfsc : !!d.upiVpa), {
    message: 'Bank payouts need an account number and IFSC; UPI payouts need a VPA.',
  });

function maskTail(v: string | null | undefined, keep = 4): string | null {
  if (!v) return null;
  const t = v.replace(/\s+/g, '');
  if (t.length <= keep) return '•'.repeat(t.length);
  return '•'.repeat(Math.min(6, t.length - keep)) + t.slice(-keep);
}

async function savePartnerPayoutDetails(req: VercelRequest, body: unknown) {
  const { uid, partnerId } = await requirePartner(req);
  const parsed = savePartnerPayoutSchema.safeParse(body);
  if (!parsed.success) {
    throw Err.invalidArgument(parsed.error.issues[0]?.message ?? 'Validation failed', parsed.error.issues);
  }
  const d = parsed.data;
  const payout = {
    method: d.method,
    accountName: d.accountName,
    bankAccountNumber: d.method === 'BANK' ? d.bankAccountNumber! : null,
    bankIfsc: d.method === 'BANK' ? d.bankIfsc!.toUpperCase() : null,
    upiVpa: d.method === 'UPI' ? d.upiVpa! : null,
    panLast4: d.pan ? d.pan.toUpperCase().slice(-4) : null,
    updatedAt: FieldValue.serverTimestamp(),
  };
  await db.collection('partners').doc(partnerId).set({ payout }, { merge: true });
  await writePartnerAudit({
    entityType: 'partner',
    entityId: partnerId,
    action: 'updatePayoutDetails',
    actorId: uid,
    actorType: 'partner',
    after: { method: d.method },
  });
  return { ok: true as const };
}

async function getMyPartnerPayoutDetails(req: VercelRequest) {
  const { partnerId } = await requirePartner(req);
  const p = (await db.collection('partners').doc(partnerId).get()).data();
  const pd = p?.payout;
  if (!pd?.method) return { payout: null };
  return {
    payout: {
      method: pd.method as string,
      accountName: (pd.accountName as string) ?? '',
      bankAccountLast4: maskTail(pd.bankAccountNumber as string | null),
      bankIfsc: (pd.bankIfsc as string | null) ?? null,
      upiVpa: pd.upiVpa ? maskTail(pd.upiVpa as string, 6) : null,
      panLast4: (pd.panLast4 as string | null) ?? null,
    },
  };
}

async function listMyPartnerPayouts(req: VercelRequest) {
  const { partnerId } = await requirePartner(req);
  const snap = await db
    .collection('payouts')
    .where('partnerId', '==', partnerId)
    .orderBy('createdAt', 'desc')
    .limit(60)
    .get();
  return {
    payouts: snap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        periodLabel: d.periodLabel as string,
        currency: (d.currency as string) ?? 'INR',
        grossMinor: Number(d.grossMinor) || 0,
        netMinor: Number(d.netMinor) || 0,
        commissionCount: ((d.commissionIds as string[]) ?? []).length,
        status: d.status as string,
        externalReference: (d.externalReference as string | null) ?? null,
        paidAt: d.paidAt ? (d.paidAt as FirebaseFirestore.Timestamp).toDate().toISOString() : null,
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

    switch (action) {
      case 'register':
        res.status(200).json(await register(req, data));
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
      case 'applyReferralCode':
        res.status(200).json(await applyReferralCode(req, data));
        return;
      // --- Partner Commission Framework (Phase 1) ---
      case 'resolvePartnerReferral':
        res.status(200).json(await resolvePartnerReferral(req, data));
        return;
      case 'submitPartnerApplication':
        res.status(200).json(await submitPartnerApplication(req, data));
        return;
      case 'getMyPartnerApplication':
        res.status(200).json(await getMyPartnerApplication(req));
        return;
      case 'createPartnerReferralCode':
        res.status(200).json(await createPartnerReferralCode(req));
        return;
      case 'listMyPartnerReferralCodes':
        res.status(200).json(await listMyPartnerReferralCodes(req));
        return;
      case 'listMyPartnerCommissions':
        res.status(200).json(await listMyPartnerCommissions(req));
        return;
      case 'savePartnerPayoutDetails':
        res.status(200).json(await savePartnerPayoutDetails(req, data));
        return;
      case 'getMyPartnerPayoutDetails':
        res.status(200).json(await getMyPartnerPayoutDetails(req));
        return;
      case 'listMyPartnerPayouts':
        res.status(200).json(await listMyPartnerPayouts(req));
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
