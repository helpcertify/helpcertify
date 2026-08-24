import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { z } from 'zod';

// Ranked results (admin) + a student's own history/dashboard. Self-contained
// — see api/auth.ts's header comment for why.

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
  notFound: (m = 'Resource not found') => new HttpError(404, m),
  invalidArgument: (m: string, details?: unknown) => new HttpError(422, m, details),
};

type Role = 'student' | 'admin';

async function requireUser(req: VercelRequest): Promise<{ uid: string; role: Role }> {
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
  // claim — see api/admin.ts's requireAdmin for why.
  const snap = await db.collection('users').doc(decoded.uid).get();
  const user = snap.data();
  if (!snap.exists || !user?.isActive) throw Err.unauthenticated('Account not found or deactivated');
  return { uid: decoded.uid, role: (user.role as Role | undefined) ?? 'student' };
}

const SUBMITTED_STATUSES = ['submitted', 'auto_submitted'];

// Firestore's DocumentData is an index-signature type (`any`-valued fields),
// so `d.data()` fields are accessed directly rather than through a named
// interface — matches the rest of this project's Vercel functions (e.g.
// quiz-session.ts reads `attempt.status`, `attempt.quizId` etc. straight off
// `.data()!` without a per-collection type).
function toAttemptRow(d: FirebaseFirestore.QueryDocumentSnapshot): { id: string } & Record<string, any> {
  return { id: d.id, ...d.data() };
}

const listForQuizSchema = z.object({ quizId: z.string().min(1), year: z.string().optional() });

async function listResultsForQuiz(role: Role, body: unknown) {
  if (role !== 'admin') throw Err.permissionDenied();
  const parsed = listForQuizSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { quizId, year } = parsed.data;

  const snap = await db.collection('quizAttempts').where('quizId', '==', quizId).orderBy('marks', 'desc').get();
  let rows = snap.docs.map(toAttemptRow).filter((r) => SUBMITTED_STATUSES.includes(r.status));
  if (year) rows = rows.filter((r) => r.userYear === year);

  return { attempts: rows.map((r, i) => ({ ...r, rank: i + 1 })) };
}

async function listResultsForStudent(uid: string) {
  const snap = await db
    .collection('quizAttempts')
    .where('userId', '==', uid)
    .orderBy('submittedAt', 'desc')
    .get();
  return { attempts: snap.docs.map(toAttemptRow).filter((r) => SUBMITTED_STATUSES.includes(r.status)) };
}

const quizIdSchema = z.object({ quizId: z.string().min(1) });

async function getMyResultForQuiz(uid: string, body: unknown) {
  const parsed = quizIdSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);

  const snap = await db.collection('quizAttempts').where('quizId', '==', parsed.data.quizId).orderBy('marks', 'desc').get();
  const rows = snap.docs.map(toAttemptRow).filter((r) => SUBMITTED_STATUSES.includes(r.status));
  const index = rows.findIndex((r) => r.userId === uid);
  if (index === -1) throw Err.notFound('No attempt found for this quiz');

  return { attempt: { ...rows[index], rank: index + 1 } };
}

const deleteAttemptSchema = z.object({ attemptId: z.string().min(1) });

async function deleteAttempt(role: Role, body: unknown) {
  if (role !== 'admin') throw Err.permissionDenied();
  const parsed = deleteAttemptSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);

  const ref = db.collection('quizAttempts').doc(parsed.data.attemptId);
  const answersSnap = await ref.collection('answers').get();
  const batch = db.batch();
  answersSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(ref);
  await batch.commit();
  return { success: true };
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { action, ...data } = (req.body ?? {}) as { action?: string; [key: string]: unknown };
    const { uid, role } = await requireUser(req);

    switch (action) {
      case 'listResultsForQuiz':
        res.status(200).json(await listResultsForQuiz(role, data));
        return;
      case 'listResultsForStudent':
        res.status(200).json(await listResultsForStudent(uid));
        return;
      case 'getMyResultForQuiz':
        res.status(200).json(await getMyResultForQuiz(uid, data));
        return;
      case 'deleteAttempt':
        res.status(200).json(await deleteAttempt(role, data));
        return;
      default:
        throw Err.invalidArgument(`Unknown action: ${String(action)}`);
    }
  } catch (err) {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message, details: err.details });
      return;
    }
    console.error('results handler error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
}
