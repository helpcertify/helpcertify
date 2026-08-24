import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
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
    createdAt: now,
    updatedAt: now,
  });

  return { uid };
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
    createdAt: now,
    updatedAt: now,
  });

  return { provisioned: true };
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
