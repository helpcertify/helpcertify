import { collection, doc, getDoc, getDocs, orderBy, query, where } from 'firebase/firestore';
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

export async function getQuizWithQuestions(quizId: string): Promise<{ quiz: QuizDoc; questions: (QuestionDoc & { id: string })[] }> {
  const quizSnap = await getDoc(doc(db, 'quizzes', quizId));
  if (!quizSnap.exists()) throw new Error('Quiz not found');
  const questionsSnap = await getDocs(query(collection(db, 'quizzes', quizId, 'questions'), orderBy('order')));
  return {
    quiz: quizSnap.data() as QuizDoc,
    questions: questionsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as QuestionDoc) })),
  };
}

export async function getPracticeQuestionsByIds(
  testId: string,
  questionIds: string[]
): Promise<(QuestionDoc & { id: string })[]> {
  const docs = await Promise.all(questionIds.map((id) => getDoc(doc(db, 'practiceTests', testId, 'questions', id))));
  return docs.filter((d) => d.exists()).map((d) => ({ id: d.id, ...(d.data() as QuestionDoc) }));
}
