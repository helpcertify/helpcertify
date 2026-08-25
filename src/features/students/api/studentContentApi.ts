import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { QuizDoc, PracticeTestDoc, QuestionDoc } from '@/types/models';

// Direct Firestore reads — firestore.rules already gates these correctly for
// a signed-in student (published quizzes readable once isPublished; every
// practiceTest doc readable once signed in, since nothing sensitive lives on
// it — the availability window is enforced server-side by
// api/practice-session.ts, this client-side bucketing is just for display),
// so no Vercel function round-trip is needed just to list/read them.

export async function listAvailableQuizzes(): Promise<(QuizDoc & { id: string })[]> {
  const snap = await getDocs(query(collection(db, 'quizzes'), where('isPublished', '==', true)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as QuizDoc) }));
}

export interface PracticeTestBuckets {
  available: (PracticeTestDoc & { id: string })[];
  upcoming: (PracticeTestDoc & { id: string })[];
  expired: (PracticeTestDoc & { id: string })[];
}

export async function listPracticeTestsBucketed(): Promise<PracticeTestBuckets> {
  const snap = await getDocs(collection(db, 'practiceTests'));
  const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as PracticeTestDoc) }));
  const now = Date.now();

  const buckets: PracticeTestBuckets = { available: [], upcoming: [], expired: [] };
  for (const t of all) {
    const from = t.availableFrom?.toMillis() ?? 0;
    const until = t.availableUntil?.toMillis() ?? Infinity;
    if (now < from) buckets.upcoming.push(t);
    else if (now > until) buckets.expired.push(t);
    else buckets.available.push(t);
  }
  return buckets;
}

// Single-doc reads for the course detail/landing pages (QuizDetailPage,
// PracticeTestDetailPage) — same direct-Firestore-read approach as the list
// functions above, just narrowed to one doc. Returns null rather than
// throwing on a missing/deleted id so the page can render a clean "not
// found" state instead of an error boundary.
export async function getQuizById(quizId: string): Promise<(QuizDoc & { id: string }) | null> {
  const snap = await getDoc(doc(db, 'quizzes', quizId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as QuizDoc) };
}

export async function getPracticeTestById(testId: string): Promise<(PracticeTestDoc & { id: string }) | null> {
  const snap = await getDoc(doc(db, 'practiceTests', testId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as PracticeTestDoc) };
}

export async function getQuizWithQuestions(quizId: string): Promise<{ quiz: QuizDoc; questions: (QuestionDoc & { id: string })[] }> {
  const quizSnap = await getDoc(doc(db, 'quizzes', quizId));
  if (!quizSnap.exists()) throw new Error('Quiz not found');
  const questionsSnap = await getDocs(query(collection(db, 'quizzes', quizId, 'questions'), orderBy('order')));
  return {
    quiz: quizSnap.data() as QuizDoc,
    questions: questionsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as QuestionDoc) })),
  };
}

// Free preview — the first 5 questions (by `order`) of a quiz/practice test,
// readable the same way getQuizWithQuestions above already reads the full
// set (no purchase gate on the question docs themselves, see that
// function's file-header comment) — a non-buyer never needs a purchase
// just to see these. Checking a selected answer's correctness still goes
// through api/quiz-session.ts's/api/practice-session.ts's previewCheckAnswer,
// since the private answer key is never readable directly from the client.
const PREVIEW_QUESTION_LIMIT = 5;

export async function getQuizPreviewQuestions(quizId: string): Promise<(QuestionDoc & { id: string })[]> {
  const snap = await getDocs(
    query(collection(db, 'quizzes', quizId, 'questions'), orderBy('order'), limit(PREVIEW_QUESTION_LIMIT))
  );
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as QuestionDoc) }));
}

export async function getPracticeTestPreviewQuestions(testId: string): Promise<(QuestionDoc & { id: string })[]> {
  const snap = await getDocs(
    query(collection(db, 'practiceTests', testId, 'questions'), orderBy('order'), limit(PREVIEW_QUESTION_LIMIT))
  );
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as QuestionDoc) }));
}

export async function getPracticeQuestionsByIds(
  testId: string,
  questionIds: string[]
): Promise<(QuestionDoc & { id: string })[]> {
  const docs = await Promise.all(questionIds.map((id) => getDoc(doc(db, 'practiceTests', testId, 'questions', id))));
  return docs.filter((d) => d.exists()).map((d) => ({ id: d.id, ...(d.data() as QuestionDoc) }));
}
