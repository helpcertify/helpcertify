import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';

// Student-facing practice-test sessions: batched, resumable, immediate
// feedback always on, reattempt-last-batch for reinforcement. Listing
// available practice tests is a direct Firestore read from the client
// (firestore.rules already gates it by the availability window) — only the
// server-trusted parts live here. Self-contained — see api/auth.ts's header
// comment for why.

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
  failedPrecondition: (m: string) => new HttpError(409, m),
  paymentRequired: (m = 'This practice test must be purchased first') => new HttpError(402, m),
};

async function requireStudent(req: VercelRequest): Promise<{ uid: string }> {
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
  if (!snap.exists || !snap.data()?.isActive) throw Err.unauthenticated('Account not found or deactivated');
  return { uid: decoded.uid };
}

async function getOrCreateProgress(uid: string, testId: string) {
  const ref = db.collection('practiceProgress').doc(`${uid}_${testId}`);
  const snap = await ref.get();
  if (snap.exists) return { ref, progress: snap.data()! };
  const progress = { userId: uid, testId, answeredQuestionIds: [] as string[], lastBatchQuestionIds: [] as string[] };
  return { ref, progress };
}

// sessionDurationMinutes is only used (and only required) when the test's
// own durationPerSessionMinutes is null — an admin choosing, per test, to
// let students pick their own session length instead of a fixed one (see
// api/content-admin.ts's createPracticeTest). Ignored otherwise: the
// admin's own setting always wins when one exists.
const startBatchSchema = z.object({
  testId: z.string().min(1),
  batchSize: z.number().int().min(1).max(500).optional(),
  sessionDurationMinutes: z.number().int().min(5).max(600).optional(),
});

async function startOrResumeBatch(uid: string, body: unknown) {
  const parsed = startBatchSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { testId, batchSize, sessionDurationMinutes } = parsed.data;

  const testSnap = await db.collection('practiceTests').doc(testId).get();
  if (!testSnap.exists) throw Err.notFound('Practice test not found');
  const test = testSnap.data()!;

  // Paid tests need a purchases/ record before a batch can start — the
  // actual enforcement point (the client-side gate is just UX).
  let alreadyPurchased = false;
  if ((test.price ?? 0) > 0) {
    const purchaseSnap = await db.collection('purchases').doc(`${uid}_practiceTest_${testId}`).get();
    alreadyPurchased = purchaseSnap.exists;
    if (!alreadyPurchased) throw Err.paymentRequired();
  }

  const now = Timestamp.now();
  if ((test.availableFrom as Timestamp).toMillis() > now.toMillis()) {
    throw Err.failedPrecondition('This practice test has not opened yet');
  }
  // A purchase is permanent access — the admin's availability window is
  // only a gate for browsing/free access, not something that can revoke
  // access a student already paid for. Confirmed live: a paying student
  // hitting this after the window closed would be locked out of something
  // they own, which isn't what "purchased" should mean.
  if (!alreadyPurchased && (test.availableUntil as Timestamp).toMillis() < now.toMillis()) {
    throw Err.failedPrecondition('This practice test is not currently available');
  }

  const existing = await db
    .collection('practiceSessions')
    .where('userId', '==', uid)
    .where('testId', '==', testId)
    .where('status', '==', 'in_progress')
    .limit(1)
    .get();
  if (!existing.empty) {
    const session = existing.docs[0].data();
    if ((session.expiresAt as Timestamp).toMillis() > now.toMillis()) {
      return { sessionId: existing.docs[0].id, session, resumed: true };
    }
    await existing.docs[0].ref.update({ status: 'expired' });
  }

  const { ref: progressRef, progress } = await getOrCreateProgress(uid, testId);
  const answeredSet = new Set(progress.answeredQuestionIds);

  const allQuestionsSnap = await db.collection('practiceTests').doc(testId).collection('questions').select().get();
  const unansweredIds = allQuestionsSnap.docs.map((d) => d.id).filter((id) => !answeredSet.has(id));
  if (unansweredIds.length === 0) {
    throw Err.failedPrecondition('No unanswered questions remain. Use Reattempt Last Batch to keep practicing.');
  }

  const size = Math.min(batchSize ?? test.defaultInitialBatchSize, unansweredIds.length);
  const batchQuestionIds = unansweredIds.slice(0, size);

  // test.durationPerSessionMinutes is null when the admin left session
  // length up to the student — in that case the client must supply one.
  const durationMinutes: number | undefined = test.durationPerSessionMinutes ?? sessionDurationMinutes;
  if (!durationMinutes) {
    throw Err.invalidArgument('Choose how long this session should run before starting.');
  }

  const sessionRef = db.collection('practiceSessions').doc();
  const session = {
    userId: uid,
    testId,
    batchQuestionIds,
    status: 'in_progress' as const,
    startedAt: now,
    submittedAt: null,
    expiresAt: Timestamp.fromMillis(now.toMillis() + durationMinutes * 60_000),
    answeredCount: 0,
    correctCount: 0,
    incorrectCount: 0,
    isReattempt: false,
  };
  await sessionRef.set(session);
  await progressRef.set(
    { userId: uid, testId, lastBatchQuestionIds: batchQuestionIds, updatedAt: now },
    { merge: true }
  );

  return { sessionId: sessionRef.id, session, resumed: false };
}

const reattemptSchema = z.object({
  testId: z.string().min(1),
  sessionDurationMinutes: z.number().int().min(5).max(600).optional(),
});

async function reattemptLastBatch(uid: string, body: unknown) {
  const parsed = reattemptSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { testId, sessionDurationMinutes } = parsed.data;

  const testSnap = await db.collection('practiceTests').doc(testId).get();
  if (!testSnap.exists) throw Err.notFound('Practice test not found');
  const test = testSnap.data()!;

  if ((test.price ?? 0) > 0) {
    const purchaseSnap = await db.collection('purchases').doc(`${uid}_practiceTest_${testId}`).get();
    if (!purchaseSnap.exists) throw Err.paymentRequired();
  }

  const { progress } = await getOrCreateProgress(uid, testId);
  if (progress.lastBatchQuestionIds.length === 0) throw Err.failedPrecondition('No previous batch to reattempt');

  const durationMinutes: number | undefined = test.durationPerSessionMinutes ?? sessionDurationMinutes;
  if (!durationMinutes) {
    throw Err.invalidArgument('Choose how long this session should run before starting.');
  }

  const now = Timestamp.now();
  const sessionRef = db.collection('practiceSessions').doc();
  const session = {
    userId: uid,
    testId,
    batchQuestionIds: progress.lastBatchQuestionIds,
    status: 'in_progress' as const,
    startedAt: now,
    submittedAt: null,
    expiresAt: Timestamp.fromMillis(now.toMillis() + durationMinutes * 60_000),
    answeredCount: 0,
    correctCount: 0,
    incorrectCount: 0,
    isReattempt: true,
  };
  await sessionRef.set(session);
  return { sessionId: sessionRef.id, session };
}

async function loadOwnedInProgressSession(uid: string, sessionId: string) {
  const ref = db.collection('practiceSessions').doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) throw Err.notFound('Session not found');
  const session = snap.data()!;
  if (session.userId !== uid) throw Err.notFound('Session not found');
  if (session.status !== 'in_progress') throw Err.failedPrecondition('This session is no longer active');
  if ((session.expiresAt as Timestamp).toMillis() < Date.now()) {
    await ref.update({ status: 'expired' });
    throw Err.failedPrecondition('This session has expired');
  }
  return { ref, session };
}

const saveAnswerSchema = z.object({
  sessionId: z.string().min(1),
  questionId: z.string().min(1),
  selectedOptionId: z.string().min(1),
});

async function saveAnswer(uid: string, body: unknown) {
  const parsed = saveAnswerSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { sessionId, questionId, selectedOptionId } = parsed.data;

  const { ref, session } = await loadOwnedInProgressSession(uid, sessionId);
  if (!session.batchQuestionIds.includes(questionId)) throw Err.invalidArgument('Question is not part of this session');

  const answerRef = ref.collection('answers').doc(questionId);
  const wasAnswered = (await answerRef.get()).exists;

  const keySnap = await db
    .collection('practiceTests')
    .doc(session.testId)
    .collection('questions')
    .doc(questionId)
    .collection('private')
    .doc('answerKey')
    .get();
  const correctOptionId: string | null = keySnap.data()?.correctOptionId ?? null;
  const isCorrect = correctOptionId === selectedOptionId;

  await answerRef.set({ selectedOptionId, isCorrect, answeredAt: Timestamp.now() });

  if (!wasAnswered) {
    await ref.update({
      answeredCount: FieldValue.increment(1),
      correctCount: FieldValue.increment(isCorrect ? 1 : 0),
      incorrectCount: FieldValue.increment(isCorrect ? 0 : 1),
    });
    // Practice progress only tracks "seen at least once" for fresh-batch
    // purposes on the student's real first pass — a reattempt (isReattempt)
    // re-serves already-seen questions and shouldn't affect this set.
    if (!session.isReattempt) {
      await db
        .collection('practiceProgress')
        .doc(`${uid}_${session.testId}`)
        .set({ answeredQuestionIds: FieldValue.arrayUnion(questionId), updatedAt: Timestamp.now() }, { merge: true });
    }
  }

  return { isCorrect, correctOptionId };
}

// Free preview — same reasoning as api/quiz-session.ts's previewCheckAnswer:
// no purchase/session required, but the question's own `order` is
// re-checked server-side against the practice test's own
// previewQuestionCount (an admin-configurable field, set when the test is
// created/edited — see api/content-admin.ts), so this can never become a
// back door to the full answer key. Falls back to 5 for a test created
// before this field existed.
const DEFAULT_PREVIEW_QUESTION_LIMIT = 5;
const previewCheckSchema = z.object({
  testId: z.string().min(1),
  questionId: z.string().min(1),
  selectedOptionId: z.string().min(1),
});

async function previewCheckAnswer(body: unknown) {
  const parsed = previewCheckSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { testId, questionId, selectedOptionId } = parsed.data;

  const testSnap = await db.collection('practiceTests').doc(testId).get();
  const previewLimit = testSnap.data()?.previewQuestionCount ?? DEFAULT_PREVIEW_QUESTION_LIMIT;

  const qRef = db.collection('practiceTests').doc(testId).collection('questions').doc(questionId);
  const qSnap = await qRef.get();
  if (!qSnap.exists) throw Err.notFound('Question not found');
  if ((qSnap.data()?.order ?? Infinity) > previewLimit) {
    throw Err.invalidArgument('This question is not part of the free preview');
  }

  const keySnap = await qRef.collection('private').doc('answerKey').get();
  const correctOptionId: string | null = keySnap.data()?.correctOptionId ?? null;
  return { isCorrect: correctOptionId === selectedOptionId, correctOptionId };
}

// ---------------------------------------------------------------------------
// Study Planner (Phase 1) — saveStudyPlan is the only write this feature
// needs server-side; every read (the plan itself, progress, past sessions
// for pace/streak/milestones) goes straight from the client via the
// Firestore SDK, the same established pattern this file's header comment
// already describes for listing available practice tests. See
// src/features/students/lib/studyPlan.ts for the actual calculation engine
// — it can't be imported here (no shared code across api/*.ts, see
// api/auth.ts's header comment), so this action only validates and stores
// inputs, it doesn't recompute the plan itself.
//
// baselineDailyTarget is trusted from the client rather than recomputed
// here: it's a UX reference point for the student's own "ahead/behind"
// framing, not an entitlement or security boundary — even a wrong value
// only ever makes that one student's own status chip inaccurate to
// themselves. baselineAnsweredCount, by contrast, is read server-side from
// practiceProgress rather than trusted from the client, since it's trivial
// to fetch correctly and there's no reason to accept a client-supplied
// number for something the server already knows.
// ---------------------------------------------------------------------------

const studyDaySchema = z.object({
  mon: z.boolean(),
  tue: z.boolean(),
  wed: z.boolean(),
  thu: z.boolean(),
  fri: z.boolean(),
  sat: z.boolean(),
  sun: z.boolean(),
});

const saveStudyPlanSchema = z.object({
  testId: z.string().min(1),
  planningMode: z.enum(['examDate', 'pace']),
  targetExamDate: z.string().datetime().nullable(),
  paceQuestionsPerDay: z.number().int().min(1).max(2000).nullable(),
  paceMinutesPerDay: z.number().int().min(1).max(1440).nullable(),
  studyDays: studyDaySchema,
  // The daily target implied by whichever inputs the learner just chose,
  // computed client-side by the same calculation engine that renders the
  // "Your Plan" result card — see the note above on why this is trusted.
  baselineDailyTarget: z.number().int().min(0).max(5000),
});

async function saveStudyPlan(uid: string, body: unknown) {
  const parsed = saveStudyPlanSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const d = parsed.data;

  const testSnap = await db.collection('practiceTests').doc(d.testId).get();
  if (!testSnap.exists) throw Err.notFound('Practice test not found');
  const test = testSnap.data()!;

  if ((test.price ?? 0) > 0) {
    const purchaseSnap = await db.collection('purchases').doc(`${uid}_practiceTest_${d.testId}`).get();
    if (!purchaseSnap.exists) throw Err.paymentRequired();
  }

  const { progress } = await getOrCreateProgress(uid, d.testId);
  // A progress doc can exist (created by startOrResumeBatch's merge-set)
  // before answeredQuestionIds is ever written (that field is only added by
  // saveAnswer, on the first answered question) — so it can be undefined
  // here even though the doc itself exists.
  const baselineAnsweredCount = progress.answeredQuestionIds?.length ?? 0;
  const revisionBufferDays = test.revisionBufferDays ?? 3;

  const planRef = db.collection('studyPlans').doc(`${uid}_${d.testId}`);
  const existing = await planRef.get();
  const now = Timestamp.now();

  await planRef.set({
    userId: uid,
    testId: d.testId,
    planningMode: d.planningMode,
    targetExamDate: d.targetExamDate ? Timestamp.fromDate(new Date(d.targetExamDate)) : null,
    paceQuestionsPerDay: d.paceQuestionsPerDay,
    paceMinutesPerDay: d.paceMinutesPerDay,
    studyDays: d.studyDays,
    revisionBufferDays,
    baselineDailyTarget: d.baselineDailyTarget,
    baselineAnsweredCount,
    baselineDate: now,
    createdAt: existing.exists ? existing.data()!.createdAt : now,
    updatedAt: now,
  });

  return { success: true };
}

const sessionIdSchema = z.object({ sessionId: z.string().min(1) });

async function submitBatch(uid: string, body: unknown) {
  const parsed = sessionIdSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { ref, session } = await loadOwnedInProgressSession(uid, parsed.data.sessionId);
  await ref.update({ status: 'submitted', submittedAt: Timestamp.now() });
  return { session: { ...session, status: 'submitted' } };
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { action, ...data } = (req.body ?? {}) as { action?: string; [key: string]: unknown };
    const { uid } = await requireStudent(req);

    switch (action) {
      case 'startOrResumeBatch':
        res.status(200).json(await startOrResumeBatch(uid, data));
        return;
      case 'reattemptLastBatch':
        res.status(200).json(await reattemptLastBatch(uid, data));
        return;
      case 'saveAnswer':
        res.status(200).json(await saveAnswer(uid, data));
        return;
      case 'submitBatch':
        res.status(200).json(await submitBatch(uid, data));
        return;
      case 'previewCheckAnswer':
        res.status(200).json(await previewCheckAnswer(data));
        return;
      case 'saveStudyPlan':
        res.status(200).json(await saveStudyPlan(uid, data));
        return;
      default:
        throw Err.invalidArgument(`Unknown action: ${String(action)}`);
    }
  } catch (err) {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message, details: err.details });
      return;
    }
    console.error('practice-session handler error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
}
