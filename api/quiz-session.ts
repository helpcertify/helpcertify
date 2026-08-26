import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';

// Student-facing exam-quiz taking: start/resume, answer, exit-tracking,
// submit+grade. Listing available quizzes and reading question text is a
// direct Firestore read from the client (firestore.rules already allows a
// signed-in user to read a published quiz's public question docs — no
// answer key is ever in them) — only the server-trusted parts live here.
// Self-contained — see api/auth.ts's header comment for why.

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
  permissionDenied: (m = 'You do not have permission to perform this action') => new HttpError(403, m),
  failedPrecondition: (m: string) => new HttpError(409, m),
  paymentRequired: (m = 'This quiz must be purchased first') => new HttpError(402, m),
};

async function requireStudent(req: VercelRequest): Promise<{ uid: string; name: string }> {
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
  const user = snap.data();
  if (!snap.exists || !user?.isActive) throw Err.unauthenticated('Account not found or deactivated');

  return { uid: decoded.uid, name: (user.name as string) ?? '' };
}

const quizIdSchema = z.object({ quizId: z.string().min(1) });

async function startAttempt(uid: string, userName: string, body: unknown) {
  const parsed = quizIdSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { quizId } = parsed.data;

  const quizSnap = await db.collection('quizzes').doc(quizId).get();
  if (!quizSnap.exists) throw Err.notFound('Quiz not found');
  const quiz = quizSnap.data()!;
  if (!quiz.isPublished) throw Err.notFound('Quiz not found');

  // Paid quizzes need a purchases/ record before an attempt can start — this
  // is the actual enforcement point. The client-side "Start Quiz" gate is
  // just UX; someone could hit this endpoint directly, so it's re-checked
  // here regardless of what the client claims.
  if ((quiz.price ?? 0) > 0) {
    const purchaseSnap = await db.collection('purchases').doc(`${uid}_quiz_${quizId}`).get();
    if (!purchaseSnap.exists) throw Err.paymentRequired();
  }

  const now = Timestamp.now();
  if (quiz.scheduledStart && (quiz.scheduledStart as Timestamp).toMillis() > now.toMillis()) {
    throw Err.failedPrecondition('This quiz has not opened yet');
  }

  const existing = await db.collection('quizAttempts').where('userId', '==', uid).where('quizId', '==', quizId).limit(1).get();
  if (!existing.empty) {
    const attempt = existing.docs[0].data();
    if (attempt.status === 'in_progress' && (attempt.expiresAt as Timestamp).toMillis() > now.toMillis()) {
      return { attemptId: existing.docs[0].id, attempt, resumed: true };
    }
    if (attempt.status === 'in_progress') {
      // Expired but never finalized (e.g. the tab was closed) — auto-submit
      // it now so the student sees why they can't restart, rather than a
      // silently stuck attempt.
      await finalizeAttempt(existing.docs[0].id, 'auto_submitted');
      throw Err.failedPrecondition('Your previous attempt timed out and was submitted automatically');
    }
    throw Err.failedPrecondition('You have already attempted this quiz');
  }

  const totalMinutes =
    quiz.durationType === 'per_question' ? quiz.durationMinutes * quiz.totalQuestions : quiz.durationMinutes;

  const attemptRef = db.collection('quizAttempts').doc();
  const attempt = {
    userId: uid,
    userName,
    quizId,
    quizTitle: quiz.title as string,
    status: 'in_progress' as const,
    startedAt: now,
    submittedAt: null,
    expiresAt: Timestamp.fromMillis(now.toMillis() + totalMinutes * 60_000),
    totalQuestions: quiz.totalQuestions as number,
    answeredCount: 0,
    notAnsweredCount: quiz.totalQuestions as number,
    incorrectCount: 0,
    correctCount: 0,
    marks: 0,
    durationSeconds: 0,
    exitCount: 0,
  };
  await attemptRef.set(attempt);

  return { attemptId: attemptRef.id, attempt, resumed: false };
}

async function loadOwnedInProgressAttempt(uid: string, attemptId: string) {
  const ref = db.collection('quizAttempts').doc(attemptId);
  const snap = await ref.get();
  if (!snap.exists) throw Err.notFound('Attempt not found');
  const attempt = snap.data()!;
  if (attempt.userId !== uid) throw Err.notFound('Attempt not found');
  if (attempt.status !== 'in_progress') throw Err.failedPrecondition('This attempt is no longer active');
  if ((attempt.expiresAt as Timestamp).toMillis() < Date.now()) {
    await finalizeAttempt(attemptId, 'auto_submitted');
    throw Err.failedPrecondition('This attempt has expired and was submitted automatically');
  }
  return { ref, attempt };
}

const saveAnswerSchema = z.object({
  attemptId: z.string().min(1),
  questionId: z.string().min(1),
  selectedOptionId: z.string().min(1),
});

async function saveAnswer(uid: string, body: unknown) {
  const parsed = saveAnswerSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { attemptId, questionId, selectedOptionId } = parsed.data;

  const { ref, attempt } = await loadOwnedInProgressAttempt(uid, attemptId);

  const answerRef = ref.collection('answers').doc(questionId);
  const wasAnswered = (await answerRef.get()).exists;

  let isCorrect: boolean | null = null;
  let correctOptionId: string | null = null;
  const quizSnap = await db.collection('quizzes').doc(attempt.quizId).get();
  if (quizSnap.data()?.showImmediateResult) {
    const keySnap = await db
      .collection('quizzes')
      .doc(attempt.quizId)
      .collection('questions')
      .doc(questionId)
      .collection('private')
      .doc('answerKey')
      .get();
    correctOptionId = keySnap.data()?.correctOptionId ?? null;
    isCorrect = correctOptionId === selectedOptionId;
  }

  await answerRef.set({ selectedOptionId, isCorrect, answeredAt: Timestamp.now() });
  if (!wasAnswered) {
    await ref.update({ answeredCount: FieldValue.increment(1), notAnsweredCount: FieldValue.increment(-1) });
  }

  return { isCorrect, correctOptionId };
}

// Free preview — lets a non-buyer try the first few questions and see
// correctness, no purchase or session required. Deliberately re-checks the
// question's own `order` against the quiz's own previewQuestionCount (an
// admin-configurable field, set when the quiz is created/edited — see
// api/content-admin.ts), rather than trusting that the client only ever
// asks about preview-eligible questions — otherwise this endpoint would be
// a back door to the full answer key, one question at a time, for anyone
// scripting direct calls to it with arbitrary questionIds. Falls back to 5
// for a quiz created before this field existed.
const DEFAULT_PREVIEW_QUESTION_LIMIT = 5;
const previewCheckSchema = z.object({
  quizId: z.string().min(1),
  questionId: z.string().min(1),
  selectedOptionId: z.string().min(1),
});

async function previewCheckAnswer(body: unknown) {
  const parsed = previewCheckSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { quizId, questionId, selectedOptionId } = parsed.data;

  const quizSnap = await db.collection('quizzes').doc(quizId).get();
  const previewLimit = quizSnap.data()?.previewQuestionCount ?? DEFAULT_PREVIEW_QUESTION_LIMIT;

  const qRef = db.collection('quizzes').doc(quizId).collection('questions').doc(questionId);
  const qSnap = await qRef.get();
  if (!qSnap.exists) throw Err.notFound('Question not found');
  if ((qSnap.data()?.order ?? Infinity) > previewLimit) {
    throw Err.permissionDenied('This question is not part of the free preview');
  }

  const keySnap = await qRef.collection('private').doc('answerKey').get();
  const correctOptionId: string | null = keySnap.data()?.correctOptionId ?? null;
  return { isCorrect: correctOptionId === selectedOptionId, correctOptionId };
}

const attemptIdSchema = z.object({ attemptId: z.string().min(1) });

async function recordExit(uid: string, body: unknown) {
  const parsed = attemptIdSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { ref } = await loadOwnedInProgressAttempt(uid, parsed.data.attemptId);
  await ref.update({ exitCount: FieldValue.increment(1) });
  return { success: true };
}

// Grades every answered question against the private answer key, updates
// counts/marks, and marks the attempt with the given terminal status. Used
// by both the student-initiated submitAttempt and the auto-submit-on-expiry
// paths above.
async function finalizeAttempt(attemptId: string, status: 'submitted' | 'auto_submitted') {
  const ref = db.collection('quizAttempts').doc(attemptId);
  const [attemptSnap, answersSnap] = await Promise.all([ref.get(), ref.collection('answers').get()]);
  const attempt = attemptSnap.data()!;
  if (attempt.status !== 'in_progress') return attempt; // already finalized

  const questionIds = answersSnap.docs.map((d) => d.id);
  const keySnaps = questionIds.length
    ? await db.getAll(
        ...questionIds.map((id) => db.collection('quizzes').doc(attempt.quizId).collection('questions').doc(id).collection('private').doc('answerKey'))
      )
    : [];
  const correctByQuestionId = new Map(keySnaps.map((s) => [s.ref.parent.parent!.id, s.data()?.correctOptionId as string | undefined]));

  let correctCount = 0;
  let incorrectCount = 0;
  const batch = db.batch();
  for (const answerDoc of answersSnap.docs) {
    const selected = answerDoc.data().selectedOptionId as string | null;
    const isCorrect = selected != null && correctByQuestionId.get(answerDoc.id) === selected;
    if (isCorrect) correctCount += 1;
    else incorrectCount += 1;
    batch.update(answerDoc.ref, { isCorrect });
  }
  if (answersSnap.size > 0) await batch.commit();

  const submittedAt = Timestamp.now();
  const notAnsweredCount = Math.max(0, (attempt.totalQuestions as number) - answersSnap.size);
  const durationSeconds = Math.round((submittedAt.toMillis() - (attempt.startedAt as Timestamp).toMillis()) / 1000);

  const finalFields = {
    status,
    submittedAt,
    correctCount,
    incorrectCount,
    notAnsweredCount,
    marks: correctCount, // 1 mark per correct answer, no negative marking
    durationSeconds,
  };
  await ref.update(finalFields);
  return { ...attempt, ...finalFields };
}

async function submitAttempt(uid: string, body: unknown) {
  const parsed = attemptIdSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { attemptId } = parsed.data;

  const snap = await db.collection('quizAttempts').doc(attemptId).get();
  if (!snap.exists) throw Err.notFound('Attempt not found');
  const attempt = snap.data()!;
  if (attempt.userId !== uid) throw Err.notFound('Attempt not found');
  if (attempt.status !== 'in_progress') throw Err.failedPrecondition('This attempt is already closed');

  const result = await finalizeAttempt(attemptId, 'submitted');
  return { attempt: result };
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { action, ...data } = (req.body ?? {}) as { action?: string; [key: string]: unknown };
    const { uid, name } = await requireStudent(req);

    switch (action) {
      case 'startAttempt':
        res.status(200).json(await startAttempt(uid, name, data));
        return;
      case 'saveAnswer':
        res.status(200).json(await saveAnswer(uid, data));
        return;
      case 'recordExit':
        res.status(200).json(await recordExit(uid, data));
        return;
      case 'submitAttempt':
        res.status(200).json(await submitAttempt(uid, data));
        return;
      case 'previewCheckAnswer':
        res.status(200).json(await previewCheckAnswer(data));
        return;
      default:
        throw Err.invalidArgument(`Unknown action: ${String(action)}`);
    }
  } catch (err) {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message, details: err.details });
      return;
    }
    console.error('quiz-session handler error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
}
