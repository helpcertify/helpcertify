import { callAction } from '@/lib/vercelApi';
import type { PracticeConfidence, PracticeFeedbackMode, QuestionOption, StudyDaySelection, StudyPlanningMode } from '@/types/models';

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
  feedbackMode?: PracticeFeedbackMode;
  isMastery?: boolean;
  currentStreak?: number;
  bestStreakThisSession?: number;
}

export interface BatchReviewQuestion {
  questionId: string;
  questionText: string;
  options: QuestionOption[];
  selectedOptionId: string | null;
  correctOptionId: string | null;
  explanation: string | null;
  isCorrect: boolean;
}

export const practiceSessionApi = {
  // sessionSize is the primary "how much would you like to practice"
  // control (10/25/50/custom) — see PracticeTestDetailPage.tsx's session
  // setup card. feedbackMode picks Learn As You Go vs Review At End,
  // defaulting server-side to 'immediate' when omitted.
  startOrResumeBatch: (testId: string, sessionSize?: number, feedbackMode?: PracticeFeedbackMode) =>
    callAction<{ sessionId: string; session: PracticeSessionState; resumed: boolean }>(
      'practice-session',
      'startOrResumeBatch',
      { testId, batchSize: sessionSize, feedbackMode }
    ),
  reattemptLastBatch: (testId: string, feedbackMode?: PracticeFeedbackMode) =>
    callAction<{ sessionId: string; session: PracticeSessionState }>('practice-session', 'reattemptLastBatch', {
      testId,
      feedbackMode,
    }),
  // Master My Mistakes (Section 31) — drills practiceProgress.
  // incorrectQuestionIds instead of unseen questions; throws if there are
  // none right now (see api/practice-session.ts's startMasteryBatch).
  startMasteryBatch: (testId: string, feedbackMode?: PracticeFeedbackMode) =>
    callAction<{ sessionId: string; session: PracticeSessionState }>('practice-session', 'startMasteryBatch', {
      testId,
      feedbackMode,
    }),
  // isCorrect/correctOptionId/explanation are all null when the session's
  // feedbackMode is 'end_of_session' — nothing to show until the batch is
  // submitted (see api/practice-session.ts's saveAnswer, which withholds
  // these server-side, not just in this response's shape). streak/
  // xpAwarded are always present (Practice Momentum, motivational only).
  saveAnswer: (sessionId: string, questionId: string, selectedOptionId: string, confidence?: PracticeConfidence) =>
    callAction<{
      isCorrect: boolean | null;
      correctOptionId: string | null;
      explanation: string | null;
      streak: number;
      xpAwarded: number;
    }>('practice-session', 'saveAnswer', { sessionId, questionId, selectedOptionId, confidence }),
  submitBatch: (sessionId: string) =>
    callAction<{ session: PracticeSessionState; newPersonalBest: boolean; bestStreak: number }>(
      'practice-session',
      'submitBatch',
      { sessionId }
    ),
  // Only callable once the session is no longer in_progress (submitted or
  // expired) — see api/practice-session.ts's getBatchReview.
  getBatchReview: (sessionId: string) =>
    callAction<{
      questions: BatchReviewQuestion[];
      summary: { totalQuestions: number; answeredCount: number; correctCount: number; incorrectCount: number };
    }>('practice-session', 'getBatchReview', { sessionId }),
  previewCheckAnswer: (testId: string, questionId: string, selectedOptionId: string) =>
    callAction<{ isCorrect: boolean; correctOptionId: string | null }>('practice-session', 'previewCheckAnswer', {
      testId,
      questionId,
      selectedOptionId,
    }),
  // See StudyGoalPanel.tsx — baselineDailyTarget is computed client-side
  // by the same calculation engine that renders the result card, then sent
  // along to be stored (see api/practice-session.ts's saveStudyPlan for why
  // that's fine to trust: it's a UX reference point, not a security value).
  saveStudyPlan: (payload: {
    testId: string;
    planningMode: StudyPlanningMode;
    targetExamDate: string | null;
    paceQuestionsPerDay: number | null;
    paceMinutesPerDay: number | null;
    studyDays: StudyDaySelection;
    baselineDailyTarget: number;
  }) => callAction<{ success: true }>('practice-session', 'saveStudyPlan', { ...payload }),
  // Write-once celebration record (see api/practice-session.ts's
  // recordMilestone) — `created: false` just means this milestone was
  // already recorded (by an earlier session or another tab), not an error.
  recordMilestone: (testId: string, milestoneKey: string, value?: number) =>
    callAction<{ created: boolean }>('practice-session', 'recordMilestone', { testId, milestoneKey, value }),
};
