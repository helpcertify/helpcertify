import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { callAction } from '@/lib/vercelApi';
import type { CourseDoc } from '@/types/models';

// Direct Firestore reads for the catalog list/detail, same pattern as
// studentContentApi.ts's listAvailableQuizzes/getQuizById - firestore.rules
// already gates courses/{id} correctly for a signed-in student (readable
// once isPublished). Lesson *content* is never read this way - it's the
// paid product, always proxied through getCourseForReading below, which
// checks entitlement/preview eligibility server-side first.

export async function listAvailableCourses(): Promise<(CourseDoc & { id: string })[]> {
  const snap = await getDocs(query(collection(db, 'courses'), where('isPublished', '==', true)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as CourseDoc) }));
}

export async function getCourseById(courseId: string): Promise<(CourseDoc & { id: string }) | null> {
  const snap = await getDoc(doc(db, 'courses', courseId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as CourseDoc) };
}

export interface CourseLessonView {
  id: string;
  order: number;
  title: string;
  content: string | null;
  locked: boolean;
}

export interface CourseForReading {
  course: CourseDoc & { id: string };
  owns: boolean;
  lessons: CourseLessonView[];
  completedLessonIndexes: number[];
}

export interface MyCourseProgressRow {
  courseId: string;
  title: string;
  coverImageUrl: string | null;
  totalLessons: number;
  completedCount: number;
  updatedAtMs: number;
}

export const courseApi = {
  getForReading: (courseId: string) => callAction<CourseForReading>('content-admin', 'getCourseForReading', { courseId }),
  markLessonComplete: (courseId: string, lessonIndex: number) =>
    callAction<{ success: true }>('content-admin', 'markLessonComplete', { courseId, lessonIndex }),
  // In-progress courses for "Jump back in" - server-joined because
  // courseProgress has no uid field to query on. See api/content-admin.ts.
  listMyProgress: () =>
    callAction<{ items: MyCourseProgressRow[] }>('content-admin', 'listMyCourseProgress'),
};
