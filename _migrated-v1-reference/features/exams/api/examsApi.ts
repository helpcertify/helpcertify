import { collection, doc, documentId, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { callAction } from '@/lib/vercelApi';
import type { ExamSummary } from '@/types/api';

interface ExamQuestionRef {
  questionId: string;
  order: number;
  marks: number;
}
interface ExamDetail extends ExamSummary {
  courseId: string;
  questions: ExamQuestionRef[];
}
interface SessionResult {
  sessionId: string;
  session: { status: string; expiresAt: unknown; totalQuestions: number };
  resumed: boolean;
}

// Firestore's `where(documentId(), 'in', [...])` caps at 30 values — chunk
// so an exam with more than 30 questions doesn't silently drop the rest.
async function getQuestionsByIds(questionIds: string[]) {
  if (!questionIds.length) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < questionIds.length; i += 30) chunks.push(questionIds.slice(i, i + 30));

  const snapshots = await Promise.all(
    chunks.map((chunk) => getDocs(query(collection(db, 'questions'), where(documentId(), 'in', chunk))))
  );
  return snapshots.flatMap((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}

// Direct Firestore read — firestore.rules only allow this once the exam is
// published AND the caller has an active enrollment in its course, so no
// separate server round trip is needed just to check access.
async function getExam(examId: string) {
  const examSnap = await getDoc(doc(db, 'exams', examId));
  if (!examSnap.exists()) throw new Error('Exam not found');
  const exam = { id: examSnap.id, ...(examSnap.data() as ExamDetail) };

  const questions = await getQuestionsByIds(exam.questions.map((q) => q.questionId));
  return { exam, questions };
}

// Curriculum preview for a course's detail page — firestore.rules allow
// reading published exam metadata to any signed-in user, enrolled or not
// (see firestore.rules); only *starting* a session requires enrollment.
async function listForCourse(courseId: string): Promise<ExamSummary[]> {
  const snap = await getDocs(
    query(collection(db, 'exams'), where('courseId', '==', courseId), where('isPublished', '==', true))
  );
  return snap.docs.map((d) => ({ _id: d.id, ...(d.data() as Omit<ExamSummary, '_id'>) }));
}

export const examsApi = {
  getExam,
  listForCourse,
  startSession: (examId: string) => callAction<SessionResult>('exam-session', 'startTestSession', { examId }),
  submitAnswer: (payload: {
    sessionId: string;
    questionId: string;
    selectedOptionIds?: string[];
    textAnswer?: string;
  }) => callAction<{ success: true }>('exam-session', 'submitAnswer', payload),
  endSession: (sessionId: string) => callAction('exam-session', 'endTestSession', { sessionId }),
};
