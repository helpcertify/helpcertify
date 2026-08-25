import { callAction } from '@/lib/vercelApi';

export interface AttemptRow {
  id: string;
  rank: number;
  userId: string;
  userName: string;
  quizId: string;
  quizTitle: string;
  status: string;
  totalQuestions: number;
  answeredCount: number;
  notAnsweredCount: number;
  incorrectCount: number;
  correctCount: number;
  marks: number;
  durationSeconds: number;
  exitCount: number;
  // Present on every doc (QuizAttemptDoc.submittedAt) but not previously
  // declared here since nothing read it — the Home dashboard's "Recent
  // attempts" table needs a date per row. Serialized Firestore Timestamp
  // over JSON ({ _seconds, _nanoseconds }, not { seconds }) — read via
  // @/utils/formatDate's toDate().
  submittedAt: unknown;
}

export const resultsApi = {
  listResultsForQuiz: (quizId: string) => callAction<{ attempts: AttemptRow[] }>('results', 'listResultsForQuiz', { quizId }),
  listResultsForStudent: () => callAction<{ attempts: AttemptRow[] }>('results', 'listResultsForStudent'),
  getMyResultForQuiz: (quizId: string) => callAction<{ attempt: AttemptRow }>('results', 'getMyResultForQuiz', { quizId }),
  deleteAttempt: (attemptId: string) => callAction<{ success: true }>('results', 'deleteAttempt', { attemptId }),
};
