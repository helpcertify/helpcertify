import { callAction } from '@/lib/vercelApi';

export interface AttemptRow {
  id: string;
  rank: number;
  userId: string;
  userName: string;
  userYear: string | null;
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
}

export const resultsApi = {
  listResultsForQuiz: (quizId: string, year?: string) =>
    callAction<{ attempts: AttemptRow[] }>('results', 'listResultsForQuiz', { quizId, year }),
  listResultsForStudent: () => callAction<{ attempts: AttemptRow[] }>('results', 'listResultsForStudent'),
  getMyResultForQuiz: (quizId: string) => callAction<{ attempt: AttemptRow }>('results', 'getMyResultForQuiz', { quizId }),
  deleteAttempt: (attemptId: string) => callAction<{ success: true }>('results', 'deleteAttempt', { attemptId }),
};
