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
    department: null,
    yearOfAdmission: null,
    currentAcademicYear: null,
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
