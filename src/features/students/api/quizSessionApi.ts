import { callAction } from '@/lib/vercelApi';

// startedAt/expiresAt arrive over JSON as a serialized Firestore Timestamp
// — { _seconds, _nanoseconds } — not an ISO string and not { seconds }.
// Read either through @/utils/formatDate's toDate(), which handles this
// shape (plus a real Timestamp instance or ISO string) — { seconds: number }
// here previously caused QuizTakingPage's countdown to render "NaN:NaN"
// for every quiz-taker (attempt.expiresAt.seconds was always undefined).
export interface QuizAttemptState {
  status: 'in_progress' | 'submitted' | 'auto_submitted' | 'expired';
  startedAt: unknown;
  expiresAt: unknown;
  totalQuestions: number;
  answeredCount: number;
  notAnsweredCount: number;
  incorrectCount: number;
  correctCount: number;
  marks: number;
  durationSeconds: number;
  exitCount: number;
}

export const quizSessionApi = {
  startAttempt: (quizId: string) =>
    callAction<{ attemptId: string; attempt: QuizAttemptState; resumed: boolean }>('quiz-session', 'startAttempt', {
      quizId,
    }),
  saveAnswer: (attemptId: string, questionId: string, selectedOptionId: string) =>
    callAction<{ isCorrect: boolean | null; correctOptionId: string | null }>('quiz-session', 'saveAnswer', {
      attemptId,
      questionId,
      selectedOptionId,
    }),
  recordExit: (attemptId: string) => callAction<{ success: true }>('quiz-session', 'recordExit', { attemptId }),
  submitAttempt: (attemptId: string) =>
    callAction<{ attempt: QuizAttemptState }>('quiz-session', 'submitAttempt', { attemptId }),
};
