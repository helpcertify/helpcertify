import { callAction } from '@/lib/vercelApi';
import type { SkillLevel } from '@/types/models';
import type { Storyboard } from '@/features/visualLessons/storyboard';

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
  // Assigned server-side on the first save; absent on a lesson the creator
  // just added and has not saved yet.
  lessonKey?: string;
  title: string;
  description: string;
  objectives: string[];
  estimatedMinutes: number;
}

export interface LessonQuizQuestion {
  order: number;
  questionText: string;
  options: { id: string; text: string }[];
  correctOptionId: string;
}

export interface LessonResource {
  label: string;
  url: string;
}

export interface DraftLesson {
  lessonKey: string;
  title: string;
  description: string;
  objectives: string[];
  estimatedMinutes: number;
  overview: string;
  content: string;
  narrationScript: string;
  quiz: LessonQuizQuestion[];
  resources: LessonResource[];
  storyboard: Storyboard | null;
  contentStatus: string;
  storyboardStatus: string;
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

  getLesson: (draftId: string, lessonKey: string) =>
    callAction<DraftLesson>('content-admin', 'getCourseDraftLesson', { draftId, lessonKey }),

  generateLessonContent: (draftId: string, lessonKey: string, force = false) =>
    callAction<{ overview: string; content: string; narrationScript: string; cached: boolean }>(
      'content-admin',
      'generateLessonContent',
      { draftId, lessonKey, force },
    ),

  updateLesson: (
    draftId: string,
    lessonKey: string,
    patch: {
      overview?: string;
      content?: string;
      narrationScript?: string;
      resources?: LessonResource[];
      storyboard?: Storyboard;
    },
  ) => callAction<{ success: true }>('content-admin', 'updateCourseDraftLesson', { draftId, lessonKey, ...patch }),

  generateLessonQuiz: (draftId: string, lessonKey: string, questionCount = 5) =>
    callAction<{ quiz: LessonQuizQuestion[] }>('content-admin', 'generateLessonQuiz', { draftId, lessonKey, questionCount }),

  generateStoryboard: (draftId: string, lessonKey: string, force = false) =>
    callAction<{ storyboard: Storyboard; cached: boolean }>('content-admin', 'generateLessonStoryboard', {
      draftId,
      lessonKey,
      force,
    }),

  regenerateScene: (draftId: string, lessonKey: string, sceneId: string, instruction = '') =>
    callAction<{ storyboard: Storyboard }>('content-admin', 'regenerateStoryboardScene', {
      draftId,
      lessonKey,
      sceneId,
      instruction,
    }),
};
