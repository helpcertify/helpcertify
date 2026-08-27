import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { createHash, randomInt } from 'node:crypto';
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

async function register(body: unknown) {
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { name, email, password } = parsed.data;

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
    createdAt: now,
    updatedAt: now,
  });

  if (emailOtpEnabled) {
    await issueEmailOtp(uid, email, name);
  }

  return { uid, otpRequired: emailOtpEnabled };
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
async function provisionProfile(req: VercelRequest) {
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

  const userRecord = await adminAuth.getUser(uid);

  const now = FieldValue.serverTimestamp();
  await userRef.set({
    name: userRecord.displayName ?? userRecord.email?.split('@')[0] ?? 'New user',
    email: userRecord.email ?? '',
    role: 'student',
    avatarUrl: userRecord.photoURL ?? null,
    isActive: true,
    // Google already verifies the address via OAuth — never OTP-gated,
    // regardless of the emailOtpEnabled setting.
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });

  return { provisioned: true };
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
        res.status(200).json(await provisionProfile(req));
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
