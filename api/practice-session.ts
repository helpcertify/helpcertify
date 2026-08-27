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
  const progress = {
    userId: uid,
    testId,
    answeredQuestionIds: [] as string[],
    lastBatchQuestionIds: [] as string[],
    incorrectQuestionIds: [] as string[],
    questionStats: {} as Record<string, { attempts: number; correct: number; lastConfidence?: string }>,
  };
  return { ref, progress };
}

// Practice sessions no longer have an enforced timer — Practice Question
// Bank sessions are sized by question count (10/25/50/custom), not
// minutes; a test's own durationPerSessionMinutes (still admin-settable in
// content-admin.ts) is now purely an "approximately N minutes" estimate the
// client computes itself, not something the server gates on. expiresAt
// still exists on the session doc, but only as a generous stale-session
// cleanup window — an abandoned in_progress session past this age is
// treated as expired so a student isn't ever blocked from starting a new
// one, not because their time genuinely "ran out."
const SESSION_STALE_HOURS = 24;
// Sensible ceiling for a single sitting — large enough for a "Custom" power
// user, small enough that one session can't quietly claim most of a huge
// bank in one shot.
const MAX_SESSION_SIZE = 200;

const startBatchSchema = z.object({
  testId: z.string().min(1),
  batchSize: z.number().int().min(1).max(MAX_SESSION_SIZE).optional(),
  feedbackMode: z.enum(['immediate', 'end_of_session']).optional(),
});

async function startOrResumeBatch(uid: string, body: unknown) {
  const parsed = startBatchSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { testId, batchSize, feedbackMode } = parsed.data;

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

  // The existing-session check and the new session's creation both need to
  // agree on "is there already an in_progress session" atomically — two
  // tabs/devices calling this at the same instant could otherwise both pass
  // the check and each get handed an overlapping batch of "unseen"
  // questions before either one's answeredQuestionIds write ever lands.
  // Wrapping both in one transaction closes that window.
  return db.runTransaction(async (t) => {
    const existingQuery = db
      .collection('practiceSessions')
      .where('userId', '==', uid)
      .where('testId', '==', testId)
      .where('status', '==', 'in_progress')
      .limit(1);
    const existing = await t.get(existingQuery);
    if (!existing.empty) {
      const existingDoc = existing.docs[0];
      const session = existingDoc.data();
      const staleMs = SESSION_STALE_HOURS * 60 * 60 * 1000;
      if (now.toMillis() - (session.startedAt as Timestamp).toMillis() < staleMs) {
        return { sessionId: existingDoc.id, session, resumed: true };
      }
      t.update(existingDoc.ref, { status: 'expired' });
    }

    const progressRef = db.collection('practiceProgress').doc(`${uid}_${testId}`);
    const progressSnap = await t.get(progressRef);
    const answeredQuestionIds = (progressSnap.data()?.answeredQuestionIds as string[] | undefined) ?? [];
    const answeredSet = new Set(answeredQuestionIds);

    const allQuestionsSnap = await db.collection('practiceTests').doc(testId).collection('questions').select().get();
    const unansweredIds = allQuestionsSnap.docs.map((d) => d.id).filter((id) => !answeredSet.has(id));
    if (unansweredIds.length === 0) {
      throw Err.failedPrecondition('No unanswered questions remain. Use Reattempt Last Batch to keep practicing.');
    }

    const size = Math.min(batchSize ?? test.defaultInitialBatchSize, unansweredIds.length);
    const batchQuestionIds = unansweredIds.slice(0, size);

    const sessionRef = db.collection('practiceSessions').doc();
    const session = {
      userId: uid,
      testId,
      batchQuestionIds,
      status: 'in_progress' as const,
      startedAt: now,
      submittedAt: null,
      expiresAt: Timestamp.fromMillis(now.toMillis() + SESSION_STALE_HOURS * 60 * 60 * 1000),
      answeredCount: 0,
      correctCount: 0,
      incorrectCount: 0,
      isReattempt: false,
      feedbackMode: feedbackMode ?? 'immediate',
    };
    t.set(sessionRef, session);
    t.set(progressRef, { userId: uid, testId, lastBatchQuestionIds: batchQuestionIds, updatedAt: now }, { merge: true });

    return { sessionId: sessionRef.id, session, resumed: false };
  });
}

const reattemptSchema = z.object({
  testId: z.string().min(1),
  feedbackMode: z.enum(['immediate', 'end_of_session']).optional(),
});

async function reattemptLastBatch(uid: string, body: unknown) {
  const parsed = reattemptSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { testId, feedbackMode } = parsed.data;

  const testSnap = await db.collection('practiceTests').doc(testId).get();
  if (!testSnap.exists) throw Err.notFound('Practice test not found');

  if ((testSnap.data()!.price ?? 0) > 0) {
    const purchaseSnap = await db.collection('purchases').doc(`${uid}_practiceTest_${testId}`).get();
    if (!purchaseSnap.exists) throw Err.paymentRequired();
  }

  const { progress } = await getOrCreateProgress(uid, testId);
  if (progress.lastBatchQuestionIds.length === 0) throw Err.failedPrecondition('No previous batch to reattempt');

  const now = Timestamp.now();
  const sessionRef = db.collection('practiceSessions').doc();
  const session = {
    userId: uid,
    testId,
    batchQuestionIds: progress.lastBatchQuestionIds,
    status: 'in_progress' as const,
    startedAt: now,
    submittedAt: null,
    expiresAt: Timestamp.fromMillis(now.toMillis() + SESSION_STALE_HOURS * 60 * 60 * 1000),
    answeredCount: 0,
    correctCount: 0,
    incorrectCount: 0,
    isReattempt: true,
    feedbackMode: feedbackMode ?? 'immediate',
  };
  await sessionRef.set(session);
  return { sessionId: sessionRef.id, session };
}

const masterySchema = z.object({
  testId: z.string().min(1),
  feedbackMode: z.enum(['immediate', 'end_of_session']).optional(),
});

// Master My Mistakes (Section 31) — an intentional-repeat session over
// practiceProgress.incorrectQuestionIds, never unseen questions. Doesn't
// touch answeredQuestionIds (see saveAnswer's isMastery check), so this
// can never inflate unique-coverage.
const MAX_MASTERY_SIZE = 100;

async function startMasteryBatch(uid: string, body: unknown) {
  const parsed = masterySchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { testId, feedbackMode } = parsed.data;

  const testSnap = await db.collection('practiceTests').doc(testId).get();
  if (!testSnap.exists) throw Err.notFound('Practice test not found');
  if ((testSnap.data()!.price ?? 0) > 0) {
    const purchaseSnap = await db.collection('purchases').doc(`${uid}_practiceTest_${testId}`).get();
    if (!purchaseSnap.exists) throw Err.paymentRequired();
  }

  const { progress } = await getOrCreateProgress(uid, testId);
  const incorrectQuestionIds = (progress.incorrectQuestionIds as string[] | undefined) ?? [];
  if (incorrectQuestionIds.length === 0) throw Err.failedPrecondition('No mistakes to master right now');

  const now = Timestamp.now();
  const sessionRef = db.collection('practiceSessions').doc();
  const session = {
    userId: uid,
    testId,
    batchQuestionIds: incorrectQuestionIds.slice(0, MAX_MASTERY_SIZE),
    status: 'in_progress' as const,
    startedAt: now,
    submittedAt: null,
    expiresAt: Timestamp.fromMillis(now.toMillis() + SESSION_STALE_HOURS * 60 * 60 * 1000),
    answeredCount: 0,
    correctCount: 0,
    incorrectCount: 0,
    isReattempt: false,
    isMastery: true,
    feedbackMode: feedbackMode ?? 'immediate',
  };
  await sessionRef.set(session);
  return { sessionId: sessionRef.id, session };
}

// Weak Areas (Section 5/11) — without question-level domain metadata (see
// QuestionDoc.domain, currently untagged on every existing question), this
// is defined as persistently-low cumulative accuracy rather than a
// domain/topic grouping: any seen question with correct/attempts below
// WEAK_ACCURACY_THRESHOLD, ordered weakest-first (the closest this release
// gets to "adaptive question selection" — prioritizing what most needs
// review, not just repeating in arbitrary order). A stricter, longer-memory
// set than incorrectQuestionIds (which only reflects the single most recent
// attempt) — a question missed once long ago but since answered right
// twice more isn't "weak," even though it may have left incorrectQuestionIds
// only recently.
const WEAK_ACCURACY_THRESHOLD = 0.5;
const MAX_WEAK_AREAS_SIZE = 100;

async function startWeakAreasBatch(uid: string, body: unknown) {
  const parsed = masterySchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { testId, feedbackMode } = parsed.data;

  const testSnap = await db.collection('practiceTests').doc(testId).get();
  if (!testSnap.exists) throw Err.notFound('Practice test not found');
  if ((testSnap.data()!.price ?? 0) > 0) {
    const purchaseSnap = await db.collection('purchases').doc(`${uid}_practiceTest_${testId}`).get();
    if (!purchaseSnap.exists) throw Err.paymentRequired();
  }

  const { progress } = await getOrCreateProgress(uid, testId);
  const questionStats = (progress.questionStats ?? {}) as Record<string, { attempts: number; correct: number }>;
  const weakIds = Object.entries(questionStats)
    .filter(([, s]) => s.attempts > 0 && s.correct / s.attempts < WEAK_ACCURACY_THRESHOLD)
    .sort(([, a], [, b]) => a.correct / a.attempts - b.correct / b.attempts)
    .map(([id]) => id);
  if (weakIds.length === 0) throw Err.failedPrecondition('No weak areas to practice right now');

  const now = Timestamp.now();
  const sessionRef = db.collection('practiceSessions').doc();
  const session = {
    userId: uid,
    testId,
    batchQuestionIds: weakIds.slice(0, MAX_WEAK_AREAS_SIZE),
    status: 'in_progress' as const,
    startedAt: now,
    submittedAt: null,
    expiresAt: Timestamp.fromMillis(now.toMillis() + SESSION_STALE_HOURS * 60 * 60 * 1000),
    answeredCount: 0,
    correctCount: 0,
    incorrectCount: 0,
    isReattempt: false,
    isWeakAreas: true,
    feedbackMode: feedbackMode ?? 'immediate',
  };
  await sessionRef.set(session);
  return { sessionId: sessionRef.id, session };
}

// Revision Cycle (Section 32) — only once the whole bank has genuinely
// been covered once (uniqueCoverage === totalQuestions); draws from every
// question in the bank, not just unseen ones (there are none left), and
// (like mastery/weak-areas) never touches answeredQuestionIds.
const MAX_REVISION_SIZE = 100;

async function startRevisionCycle(uid: string, body: unknown) {
  const parsed = masterySchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { testId, feedbackMode } = parsed.data;

  const testSnap = await db.collection('practiceTests').doc(testId).get();
  if (!testSnap.exists) throw Err.notFound('Practice test not found');
  const test = testSnap.data()!;
  if ((test.price ?? 0) > 0) {
    const purchaseSnap = await db.collection('purchases').doc(`${uid}_practiceTest_${testId}`).get();
    if (!purchaseSnap.exists) throw Err.paymentRequired();
  }

  const { progress } = await getOrCreateProgress(uid, testId);
  const answeredCount = (progress.answeredQuestionIds as string[] | undefined)?.length ?? 0;
  if (answeredCount < (test.totalQuestions as number)) {
    throw Err.failedPrecondition('Finish practicing every question at least once before starting a revision cycle');
  }

  const allQuestionsSnap = await db.collection('practiceTests').doc(testId).collection('questions').select().get();
  const allIds = allQuestionsSnap.docs.map((d) => d.id);

  const now = Timestamp.now();
  const sessionRef = db.collection('practiceSessions').doc();
  const session = {
    userId: uid,
    testId,
    batchQuestionIds: allIds.slice(0, MAX_REVISION_SIZE),
    status: 'in_progress' as const,
    startedAt: now,
    submittedAt: null,
    expiresAt: Timestamp.fromMillis(now.toMillis() + SESSION_STALE_HOURS * 60 * 60 * 1000),
    answeredCount: 0,
    correctCount: 0,
    incorrectCount: 0,
    isReattempt: false,
    isRevision: true,
    feedbackMode: feedbackMode ?? 'immediate',
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
  // Optional self-rating — learning analytics only, never used in the
  // isCorrect computation below.
  confidence: z.enum(['guessing', 'unsure', 'confident']).optional(),
});

// Practice Momentum XP (Section 25) — motivational only, never read by any
// entitlement/coverage/accuracy calculation. Any intentional-repeat session
// (Master My Mistakes, Weak Areas, Revision Cycle) awards the smaller
// "reviewed a weak question" amount instead of the normal first-attempt
// amounts, since it's review, not new coverage.
function xpForAnswer(isCorrect: boolean, isReview: boolean): number {
  if (isReview) return isCorrect ? 2 : 0;
  return isCorrect ? 10 : 5;
}

async function saveAnswer(uid: string, body: unknown) {
  const parsed = saveAnswerSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { sessionId, questionId, selectedOptionId, confidence } = parsed.data;

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
  const explanation: string | null = keySnap.data()?.explanation ?? null;
  const isCorrect = correctOptionId === selectedOptionId;

  await answerRef.set({
    selectedOptionId,
    isCorrect,
    answeredAt: Timestamp.now(),
    ...(confidence ? { confidence } : {}),
  });

  // Correct-streak — Practice Test only, resets to 0 on a miss. Tracked on
  // the session doc itself (this batch's own streak), not persisted
  // globally; submitBatch compares this session's best against the
  // test's all-time bestStreak on practiceProgress.
  const nextStreak = isCorrect ? ((session.currentStreak as number | undefined) ?? 0) + 1 : 0;
  const nextBestThisSession = Math.max((session.bestStreakThisSession as number | undefined) ?? 0, nextStreak);

  let xpAwarded = 0;
  if (!wasAnswered) {
    xpAwarded = xpForAnswer(isCorrect, !!session.isMastery || !!session.isWeakAreas || !!session.isRevision);
    await ref.update({
      answeredCount: FieldValue.increment(1),
      correctCount: FieldValue.increment(isCorrect ? 1 : 0),
      incorrectCount: FieldValue.increment(isCorrect ? 0 : 1),
      currentStreak: nextStreak,
      bestStreakThisSession: nextBestThisSession,
    });
    // Practice progress only tracks "seen at least once" for fresh-batch
    // purposes on the student's real first pass — a reattempt/mastery
    // session re-serves already-seen questions and shouldn't affect this
    // set. incorrectQuestionIds, by contrast, is updated regardless of
    // session type — a mistake mastered during a Master My Mistakes
    // session should still drop off that list.
    const progressUpdate: Record<string, unknown> = {
      xpTotal: FieldValue.increment(xpAwarded),
      incorrectQuestionIds: isCorrect ? FieldValue.arrayRemove(questionId) : FieldValue.arrayUnion(questionId),
      updatedAt: Timestamp.now(),
    };
    if (!session.isReattempt && !session.isMastery && !session.isWeakAreas && !session.isRevision) {
      progressUpdate.answeredQuestionIds = FieldValue.arrayUnion(questionId);
    }
    // Cumulative per-question accuracy (Section 28's "unique coverage" vs
    // "total answers submitted" distinction, and Section 29/30's Mastered/
    // Learning/Needs Review buckets) — updated regardless of session type,
    // since a mastery/weak-areas/revision repeat is still a real attempt at
    // this specific question, just not new coverage.
    progressUpdate.questionStats = {
      [questionId]: {
        attempts: FieldValue.increment(1),
        correct: FieldValue.increment(isCorrect ? 1 : 0),
        ...(confidence ? { lastConfidence: confidence } : {}),
      },
    };
    await db.collection('practiceProgress').doc(`${uid}_${session.testId}`).set(progressUpdate, { merge: true });
  } else {
    // A repeat submission within the same session (shouldn't normally
    // happen from the UI, which disables an already-answered question) —
    // still reflect the current streak/XP truth back to the client rather
    // than silently returning stale numbers.
    await ref.update({ currentStreak: nextStreak, bestStreakThisSession: nextBestThisSession });
  }

  // Streak is shown live regardless of feedback mode — Section 24 doesn't
  // treat it as something that leaks correctness the way the correct
  // option/explanation would (a streak counter alone doesn't tell you
  // which specific answer was right), but see PracticeTakingPage.tsx: it
  // still only ever displays the streak once Review At End's session is
  // over, matching Section 24's "do not show during Review At End until
  // the session is completed."
  const streakInfo = { streak: nextStreak, xpAwarded };

  // Review At End (feedbackMode === 'end_of_session') must never leak
  // correctness mid-session — the answer is still recorded above (the
  // server needs it for the end-of-session review), it's just withheld
  // from this response. Missing feedbackMode (a session from before this
  // field existed) behaves as 'immediate', same as it always has.
  if (session.feedbackMode === 'end_of_session') {
    return { isCorrect: null, correctOptionId: null, explanation: null, ...streakInfo };
  }
  return { isCorrect, correctOptionId, explanation, ...streakInfo };
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

// Milestone celebrations (Study Planner step 4) — write-once records so a
// celebration is shown exactly once per (learner, test, milestone). The key
// format is validated but not checked against a fixed enum: the actual
// threshold values (100/250/500 questions, 25/50/75/100 percent, 3/7/14/30
// streak days) live in src/features/students/lib/studyPlan.ts, which this
// file can't import (see the repo's no-shared-code-across-api-files rule) -
// keeping this a format check instead of a value allow-list means the two
// files never need to be kept in sync.
const recordMilestoneSchema = z.object({
  testId: z.string().min(1),
  milestoneKey: z.string().regex(/^[a-z]+_[0-9]+$/),
  value: z.number().optional(),
});

async function recordMilestone(uid: string, body: unknown) {
  const parsed = recordMilestoneSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { testId, milestoneKey, value } = parsed.data;

  const ref = db.collection('studyMilestones').doc(`${uid}_${testId}_${milestoneKey}`);
  try {
    // .create() (not .set()) so this is atomically write-once even against
    // a race between two tabs/devices reaching the same threshold at once -
    // whichever request loses gets ALREADY_EXISTS below, not a silent
    // overwrite of the first celebration's reachedAt.
    await ref.create({
      userId: uid,
      testId,
      milestoneKey,
      reachedAt: Timestamp.now(),
      ...(value !== undefined ? { value } : {}),
    });
    // Section 26's "Today's Goal Complete → +25 XP" bonus reuses this
    // same write-once guarantee (a 'dailyTargetBonus_<date>' key can only
    // ever be created once) rather than a second endpoint — the .create()
    // above already raced-and-won by the time this runs, so the increment
    // below can't double-award even from two simultaneous requests.
    if (milestoneKey.startsWith('dailyTargetBonus_')) {
      await db
        .collection('practiceProgress')
        .doc(`${uid}_${testId}`)
        .set({ xpTotal: FieldValue.increment(25), updatedAt: Timestamp.now() }, { merge: true });
    }
    return { created: true };
  } catch (err) {
    const code = (err as { code?: number | string })?.code;
    const message = err instanceof Error ? err.message : '';
    if (code === 6 || code === 'already-exists' || /already exists/i.test(message)) {
      return { created: false };
    }
    throw err;
  }
}

const sessionIdSchema = z.object({ sessionId: z.string().min(1) });

async function submitBatch(uid: string, body: unknown) {
  const parsed = sessionIdSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);
  const { ref, session } = await loadOwnedInProgressSession(uid, parsed.data.sessionId);
  await ref.update({ status: 'submitted', submittedAt: Timestamp.now() });

  // Personal best (Section 24: "New Personal Best") — compared against the
  // test's all-time bestStreak only once the session is actually done, not
  // continuously mid-session, so a still-in-progress streak can't
  // prematurely claim a best that a later question in the same session
  // might beat again.
  const bestThisSession = (session.bestStreakThisSession as number | undefined) ?? 0;
  let newPersonalBest = false;
  if (bestThisSession >= 2) {
    const progressRef = db.collection('practiceProgress').doc(`${uid}_${session.testId}`);
    const progressSnap = await progressRef.get();
    const priorBest = (progressSnap.data()?.bestStreak as number | undefined) ?? 0;
    if (bestThisSession > priorBest) {
      await progressRef.set({ bestStreak: bestThisSession, updatedAt: Timestamp.now() }, { merge: true });
      newPersonalBest = true;
    }
  }

  return { session: { ...session, status: 'submitted' }, newPersonalBest, bestStreak: bestThisSession };
}

// The end-of-session review screen (both feedback modes use this — Learn
// As You Go for its "Review Answers" button, Review At End since it's the
// only place those answers are ever revealed at all). Only for a
// non-in_progress session, so a Review At End session can't have this
// called mid-batch to route around the withholding in saveAnswer.
async function getBatchReview(uid: string, body: unknown) {
  const parsed = sessionIdSchema.safeParse(body);
  if (!parsed.success) throw Err.invalidArgument('Validation failed', parsed.error.issues);

  const sessionRef = db.collection('practiceSessions').doc(parsed.data.sessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) throw Err.notFound('Session not found');
  const session = sessionSnap.data()!;
  if (session.userId !== uid) throw Err.notFound('Session not found');
  if (session.status === 'in_progress') throw Err.failedPrecondition('Finish this session before reviewing it');

  const batchQuestionIds: string[] = session.batchQuestionIds;
  const questionsRef = db.collection('practiceTests').doc(session.testId).collection('questions');

  const [questionSnaps, keySnaps, answerSnaps] = await Promise.all([
    db.getAll(...batchQuestionIds.map((id) => questionsRef.doc(id))),
    db.getAll(...batchQuestionIds.map((id) => questionsRef.doc(id).collection('private').doc('answerKey'))),
    db.getAll(...batchQuestionIds.map((id) => sessionRef.collection('answers').doc(id))),
  ]);

  const questions = batchQuestionIds.map((id, i) => {
    const q = questionSnaps[i].data();
    const key = keySnaps[i].data();
    const answer = answerSnaps[i].data();
    return {
      questionId: id,
      questionText: q?.questionText ?? '',
      options: q?.options ?? [],
      selectedOptionId: answer?.selectedOptionId ?? null,
      correctOptionId: key?.correctOptionId ?? null,
      explanation: key?.explanation ?? null,
      isCorrect: answer?.isCorrect ?? false,
    };
  });

  return {
    questions,
    summary: {
      totalQuestions: batchQuestionIds.length,
      answeredCount: session.answeredCount,
      correctCount: session.correctCount,
      incorrectCount: session.incorrectCount,
    },
  };
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
      case 'startMasteryBatch':
        res.status(200).json(await startMasteryBatch(uid, data));
        return;
      case 'startWeakAreasBatch':
        res.status(200).json(await startWeakAreasBatch(uid, data));
        return;
      case 'startRevisionCycle':
        res.status(200).json(await startRevisionCycle(uid, data));
        return;
      case 'getBatchReview':
        res.status(200).json(await getBatchReview(uid, data));
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
      case 'recordMilestone':
        res.status(200).json(await recordMilestone(uid, data));
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
