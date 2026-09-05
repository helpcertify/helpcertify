import { callAction } from '@/lib/vercelApi';
import type { SkillLevel } from '@/types/models';

// AI course creation - the dedicated blueprint -> lessons -> visual
// lessons flow. Server side lives in api/content-admin.ts alongside the
// older generateCourseOutline; both share the aiCourseDrafts collection,
// feature access (ai_course_builder) and the monthly generation quota.
// The existing AiCourseBuilderFlow (quiz / practice test) is untouched.

export interface CourseMeta {
  title: string;
  description: string;
  targetAudience: string;
  difficulty: SkillLevel;
  language: string;
  learningObjectives: string[];
}

export interface CourseLessonOutline {
  moduleIndex: number;
  title: string;
  description: string;
  objectives: string[];
  estimatedMinutes: number;
}

export interface CourseDraftListRow {
  draftId: string;
  title: string;
  status: string;
  lessonCount: number;
  updatedAtMs: number;
}

export interface CourseDraft {
  draftId: string;
  status: string;
  category: string;
  courseMeta: CourseMeta | null;
  outline: CourseLessonOutline[];
}

export const courseBuilderApi = {
  listMyDrafts: () => callAction<{ drafts: CourseDraftListRow[] }>('content-admin', 'listMyCourseDrafts'),

  getDraft: (draftId: string) => callAction<CourseDraft>('content-admin', 'getCourseDraft', { draftId }),

  generateBlueprint: (payload: {
    title: string;
    description?: string;
    targetAudience?: string;
    difficulty?: SkillLevel;
    lessonCount?: number;
    language?: string;
    category?: string;
  }) =>
    callAction<{ draftId: string; courseMeta: CourseMeta; outline: CourseLessonOutline[] }>(
      'content-admin',
      'generateCourseBlueprint',
      payload,
    ),

  updateDraft: (draftId: string, courseMeta: CourseMeta, outline: CourseLessonOutline[]) =>
    callAction<{ success: true }>('content-admin', 'updateCourseDraft', { draftId, courseMeta, outline }),
};
