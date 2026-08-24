import { callAction } from '@/lib/vercelApi';
import type { QuestionSourceFormat, DurationType } from '@/types/models';

export interface QuizSummary {
  id: string;
  title: string;
  code: string;
  sourceFormat: QuestionSourceFormat;
  totalQuestions: number;
  durationType: DurationType;
  durationMinutes: number;
  // Serialized Firestore Timestamp over JSON — { _seconds, _nanoseconds },
  // not { seconds }. Read via @/utils/formatDate's toDate(), never this
  // field directly (see QuizTakingPage.tsx's countdown-timer bug history).
  scheduledStart: unknown;
  isPublished: boolean;
  enforceSequentialNav: boolean;
  showImmediateResult: boolean;
  showFinalScore: boolean;
  antiCheat: { blockAltTab: boolean };
  price: number;
  originalPrice: number | null;
}

export interface PracticeTestSummary {
  id: string;
  title: string;
  sourceFormat: QuestionSourceFormat;
  totalQuestions: number;
  durationPerSessionMinutes: number;
  defaultInitialBatchSize: number;
  // Serialized Firestore Timestamp over JSON — { _seconds, _nanoseconds },
  // not { seconds }. Read via @/utils/formatDate's toDate().
  availableFrom: unknown;
  availableUntil: unknown;
  price: number;
  originalPrice: number | null;
}

export interface CreateQuizPayload {
  title: string;
  sourceFormat: QuestionSourceFormat;
  fileUrl: string;
  durationType: DurationType;
  durationMinutes: number;
  enforceSequentialNav: boolean;
  showImmediateResult: boolean;
  showFinalScore: boolean;
  scheduledStart?: string;
  blockAltTab: boolean;
  price: number;
  originalPrice?: number | null;
}

export interface CreatePracticeTestPayload {
  title: string;
  sourceFormat: QuestionSourceFormat;
  fileUrl: string;
  availableFrom: string;
  availableUntil: string;
  durationPerSessionMinutes: number;
  defaultInitialBatchSize: number;
  price: number;
  originalPrice?: number | null;
}

export const contentAdminApi = {
  createQuiz: (payload: CreateQuizPayload) =>
    callAction<{ quizId: string; totalQuestions: number; parseErrors: unknown[] }>(
      'content-admin',
      'createQuiz',
      { ...payload }
    ),
  updateQuiz: (
    payload: { quizId: string } & Partial<Omit<CreateQuizPayload, 'scheduledStart'>> & {
        isPublished?: boolean;
        scheduledStart?: string | null;
      }
  ) => callAction<{ success: true }>('content-admin', 'updateQuiz', { ...payload }),
  deleteQuiz: (quizId: string) => callAction<{ success: true }>('content-admin', 'deleteQuiz', { quizId }),
  listQuizzesAdmin: () => callAction<{ quizzes: QuizSummary[] }>('content-admin', 'listQuizzesAdmin'),
  getQuizAnswerKey: (quizId: string) =>
    callAction<{
      quiz: QuizSummary;
      questions: { id: string; order: number; questionText: string; options: { id: string; text: string }[]; correctOptionId: string | null }[];
    }>('content-admin', 'getQuizAnswerKey', { quizId }),

  createPracticeTest: (payload: CreatePracticeTestPayload) =>
    callAction<{ testId: string; totalQuestions: number; parseErrors: unknown[] }>(
      'content-admin',
      'createPracticeTest',
      { ...payload }
    ),
  updatePracticeTest: (payload: { testId: string } & Partial<CreatePracticeTestPayload>) =>
    callAction<{ success: true }>('content-admin', 'updatePracticeTest', { ...payload }),
  deletePracticeTest: (testId: string) =>
    callAction<{ success: true }>('content-admin', 'deletePracticeTest', { testId }),
  listPracticeTestsAdmin: () =>
    callAction<{ practiceTests: PracticeTestSummary[] }>('content-admin', 'listPracticeTestsAdmin'),
  getPracticeTestAnswerKey: (testId: string) =>
    callAction<{
      practiceTest: PracticeTestSummary;
      questions: { id: string; order: number; questionText: string; options: { id: string; text: string }[]; correctOptionId: string | null }[];
    }>('content-admin', 'getPracticeTestAnswerKey', { testId }),
};
