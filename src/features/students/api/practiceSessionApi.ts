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
  // sessionDurationMinutes is only actually used (and only required) when
  // the test's own durationPerSessionMinutes is null — i.e. the admin left
  // session length up to the student (see PracticeTestDetailPage.tsx's
  // duration picker, shown only in that case). Harmless to pass otherwise;
  // the server ignores it whenever the test has its own fixed duration.
  startOrResumeBatch: (testId: string, batchSize?: number, sessionDurationMinutes?: number) =>
    callAction<{ sessionId: string; session: PracticeSessionState; resumed: boolean }>(
      'practice-session',
      'startOrResumeBatch',
      { testId, batchSize, sessionDurationMinutes }
    ),
  reattemptLastBatch: (testId: string, sessionDurationMinutes?: number) =>
    callAction<{ sessionId: string; session: PracticeSessionState }>('practice-session', 'reattemptLastBatch', {
      testId,
      sessionDurationMinutes,
    }),
  saveAnswer: (sessionId: string, questionId: string, selectedOptionId: string) =>
    callAction<{ isCorrect: boolean; correctOptionId: string | null }>('practice-session', 'saveAnswer', {
      sessionId,
      questionId,
      selectedOptionId,
    }),
  submitBatch: (sessionId: string) =>
    callAction<{ session: PracticeSessionState }>('practice-session', 'submitBatch', { sessionId }),
  previewCheckAnswer: (testId: string, questionId: string, selectedOptionId: string) =>
    callAction<{ isCorrect: boolean; correctOptionId: string | null }>('practice-session', 'previewCheckAnswer', {
      testId,
      questionId,
      selectedOptionId,
    }),
};
