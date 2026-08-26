import { callAction } from '@/lib/vercelApi';
import type { QuestionSourceFormat, DurationType, SkillLevel } from '@/types/models';

export interface QuestionOption {
  id: string;
  text: string;
}

// One entry per question the .docx parser (api/content-admin.ts) had to
// skip — surfaced in the create-form's upload report, not just the browser
// console, so an admin can actually see what needs fixing in the source
// file without opening dev tools.
export interface ParseErrorEntry {
  line: number;
  message: string;
  rawText: string;
}
export interface EditableQuestion {
  id: string;
  order: number;
  questionText: string;
  options: QuestionOption[];
  correctOptionId: string | null;
}

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
  currency: 'INR' | 'USD';
  // A plain string, not the CertificationCategory union — the create forms
  // let an admin type a category that isn't in the fixed list (see
  // CategorySelect.tsx), and api/content-admin.ts's schema accepts any
  // non-empty string rather than restricting to the known set.
  category: string;
  skillLevel: SkillLevel;
  description: string;
  passMarkPercent: number;
  previewQuestionCount: number;
}

export interface PracticeTestSummary {
  id: string;
  title: string;
  sourceFormat: QuestionSourceFormat;
  totalQuestions: number;
  // null when the admin has left session length up to each student (see
  // api/practice-session.ts's startOrResumeBatch) instead of setting one.
  durationPerSessionMinutes: number | null;
  defaultInitialBatchSize: number;
  // Serialized Firestore Timestamp over JSON — { _seconds, _nanoseconds },
  // not { seconds }. Read via @/utils/formatDate's toDate().
  availableFrom: unknown;
  availableUntil: unknown;
  price: number;
  originalPrice: number | null;
  currency: 'INR' | 'USD';
  // A plain string, not the CertificationCategory union — the create forms
  // let an admin type a category that isn't in the fixed list (see
  // CategorySelect.tsx), and api/content-admin.ts's schema accepts any
  // non-empty string rather than restricting to the known set.
  category: string;
  skillLevel: SkillLevel;
  description: string;
  previewQuestionCount: number;
  // Personal Study Planner (Phase 1) config — see CreatePracticeTestPayload's
  // comment on the same three fields.
  revisionBufferDays?: number;
  defaultMinutesPerQuestion?: number;
  studyPlannerEnabled?: boolean;
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
  currency: 'INR' | 'USD';
  // A plain string, not the CertificationCategory union — the create forms
  // let an admin type a category that isn't in the fixed list (see
  // CategorySelect.tsx), and api/content-admin.ts's schema accepts any
  // non-empty string rather than restricting to the known set.
  category: string;
  skillLevel: SkillLevel;
  description: string;
  passMarkPercent: number;
  previewQuestionCount: number;
}

export interface CreatePracticeTestPayload {
  title: string;
  sourceFormat: QuestionSourceFormat;
  fileUrl: string;
  availableFrom: string;
  availableUntil: string;
  // null means the admin is leaving session length up to each student —
  // see PracticeTestSummary's comment on this same field.
  durationPerSessionMinutes: number | null;
  defaultInitialBatchSize: number;
  price: number;
  originalPrice?: number | null;
  currency: 'INR' | 'USD';
  // A plain string, not the CertificationCategory union — the create forms
  // let an admin type a category that isn't in the fixed list (see
  // CategorySelect.tsx), and api/content-admin.ts's schema accepts any
  // non-empty string rather than restricting to the known set.
  category: string;
  skillLevel: SkillLevel;
  description: string;
  previewQuestionCount: number;
  // Personal Study Planner (Phase 1) config — see api/content-admin.ts's
  // createPracticeTestSchema for defaults.
  revisionBufferDays?: number;
  defaultMinutesPerQuestion?: number;
  studyPlannerEnabled?: boolean;
}

export const contentAdminApi = {
  createQuiz: (payload: CreateQuizPayload) =>
    callAction<{ quizId: string; totalQuestions: number; parseErrors: ParseErrorEntry[]; parseWarnings: string[] }>(
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
    callAction<{ quiz: QuizSummary; questions: EditableQuestion[] }>('content-admin', 'getQuizAnswerKey', { quizId }),
  updateQuizQuestion: (payload: { quizId: string; questionId: string; questionText: string; options: QuestionOption[]; correctOptionId: string }) =>
    callAction<{ success: true }>('content-admin', 'updateQuizQuestion', { ...payload }),

  createPracticeTest: (payload: CreatePracticeTestPayload) =>
    callAction<{ testId: string; totalQuestions: number; parseErrors: ParseErrorEntry[]; parseWarnings: string[] }>(
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
    callAction<{ practiceTest: PracticeTestSummary; questions: EditableQuestion[] }>(
      'content-admin',
      'getPracticeTestAnswerKey',
      { testId }
    ),
  updatePracticeTestQuestion: (payload: {
    testId: string;
    questionId: string;
    questionText: string;
    options: QuestionOption[];
    correctOptionId: string;
  }) => callAction<{ success: true }>('content-admin', 'updatePracticeTestQuestion', { ...payload }),
};
