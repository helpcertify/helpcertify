import { callAction } from '@/lib/vercelApi';

export interface PracticeSessionState {
  status: 'in_progress' | 'submitted' | 'expired';
  batchQuestionIds: string[];
  // Serialized Firestore Timestamp over JSON — { _seconds, _nanoseconds },
  // not { seconds }. Not currently read anywhere, but see
  // quizSessionApi.ts's QuizAttemptState for what reading this wrong shape
  // did to the quiz timer — read via @/utils/formatDate's toDate() if this
  // ever needs displaying.
  expiresAt: unknown;
  answeredCount: number;
  correctCount: number;
  incorrectCount: number;
  isReattempt: boolean;
}

export const practiceSessionApi = {
  startOrResumeBatch: (testId: string, batchSize?: number) =>
    callAction<{ sessionId: string; session: PracticeSessionState; resumed: boolean }>(
      'practice-session',
      'startOrResumeBatch',
      { testId, batchSize }
    ),
  reattemptLastBatch: (testId: string) =>
    callAction<{ sessionId: string; session: PracticeSessionState }>('practice-session', 'reattemptLastBatch', { testId }),
  saveAnswer: (sessionId: string, questionId: string, selectedOptionId: string) =>
    callAction<{ isCorrect: boolean }>('practice-session', 'saveAnswer', { sessionId, questionId, selectedOptionId }),
  submitBatch: (sessionId: string) =>
    callAction<{ session: PracticeSessionState }>('practice-session', 'submitBatch', { sessionId }),
};
