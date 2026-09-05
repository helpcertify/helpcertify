import { callAction } from '@/lib/vercelApi';

// AI Course Builder - see api/content-admin.ts's own header comment above
// generateCourseOutline for the full design. Gated by Feature Access
// (checkMyFeatureAccess), so the client only needs to know whether the
// current account is allowed, not who owns which capability.

export interface AiOutlineModule {
  moduleIndex: number;
  title: string;
  description: string;
  questionsPerModule: number;
}

export interface AiParsedOption {
  id: string;
  text: string;
}

export interface AiParsedQuestion {
  order: number;
  questionText: string;
  options: AiParsedOption[];
  correctOptionId: string;
}

export const aiCourseBuilderApi = {
  checkMyAccess: () => callAction<{ allowed: boolean }>('content-admin', 'checkMyFeatureAccess', { featureKey: 'ai_course_builder' }),

  generateOutline: (payload: {
    topic: string;
    itemType: 'quiz' | 'practiceTest' | 'course';
    category?: string;
    skillLevel?: 'Foundation' | 'Associate' | 'Expert';
    moduleCount?: number;
  }) => callAction<{ draftId: string; outline: AiOutlineModule[] }>('content-admin', 'generateCourseOutline', payload),

  updateOutline: (draftId: string, outline: AiOutlineModule[]) =>
    callAction<{ success: true }>('content-admin', 'updateDraftOutline', { draftId, outline }),

  generateContent: (draftId: string) =>
    callAction<{
      draftId: string;
      generatedQuestions: Record<string, AiParsedQuestion[]>;
      generatedLessons: Record<string, string>;
      warnings: string[];
    }>('content-admin', 'generateAllCourseContent', { draftId }),

  submitDraft: (payload: {
    draftId: string;
    title: string;
    category?: string;
    description?: string;
    suggestedPrice?: number;
    currency?: 'INR' | 'USD';
  }) =>
    callAction<{ submissionId: string; totalQuestions: number; totalLessons?: number; autoApproved: boolean }>(
      'content-admin',
      'submitAiCourseDraft',
      payload
    ),
};
