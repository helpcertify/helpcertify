import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { callAction } from '@/lib/vercelApi';
import type { Course, Enrollment } from '@/types/api';

function toCourse(id: string, data: Record<string, unknown>): Course {
  return {
    _id: id,
    title: data.title as string,
    slug: data.slug as string,
    description: data.description as string | undefined,
    category: data.category as string,
    tags: data.tags as string[] | undefined,
    level: data.level as Course['level'],
    thumbnailUrl: (data.thumbnailUrl as string | null) ?? null,
    durationHours: data.durationHours as number | undefined,
    price: data.price as number | undefined,
    isFree: data.isFree as boolean | undefined,
    instructorName: data.instructorName as string | undefined,
    averageRating: data.averageRating as number | undefined,
    ratingCount: data.ratingCount as number | undefined,
  };
}

export const coursesApi = {
  // firestore.rules scope this to the caller's own enrollments — passing a
  // different uid here would just return an empty snapshot, not another
  // user's data.
  async listEnrolled(uid: string): Promise<{ enrollments: Enrollment[] }> {
    const snap = await getDocs(query(collection(db, 'enrollments'), where('userId', '==', uid)));

    const enrollments = await Promise.all(
      snap.docs.map(async (enrollmentDoc) => {
        const data = enrollmentDoc.data();
        const courseSnap = await getDoc(doc(db, 'courses', data.courseId as string));
        return {
          _id: enrollmentDoc.id,
          status: data.status as Enrollment['status'],
          progressPercent: data.progressPercent as number,
          course: toCourse(courseSnap.id, courseSnap.data() ?? {}),
        };
      })
    );

    return { enrollments };
  },

  // Catalog browsing — firestore.rules allow reading any course with
  // isPublished == true to any signed-in user, no ownership check needed.
  async listPublished(category?: string): Promise<Course[]> {
    const filters = [where('isPublished', '==', true)];
    if (category) filters.push(where('category', '==', category));
    const snap = await getDocs(query(collection(db, 'courses'), ...filters));
    return snap.docs.map((d) => toCourse(d.id, d.data()));
  },

  async getBySlug(slug: string): Promise<Course | null> {
    const snap = await getDocs(query(collection(db, 'courses'), where('slug', '==', slug), limit(1)));
    if (snap.empty) return null;
    return toCourse(snap.docs[0].id, snap.docs[0].data());
  },

  enroll: (courseId: string) =>
    callAction<{ enrollment: unknown; wasReEnrollment: boolean }>('enrollment', 'enrollInCourse', { courseId }),
  unenroll: (courseId: string) => callAction<{ success: true }>('enrollment', 'unenrollFromCourse', { courseId }),
};
