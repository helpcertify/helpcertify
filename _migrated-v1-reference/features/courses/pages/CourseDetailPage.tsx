import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { coursesApi } from '../api/coursesApi';
import { examsApi } from '@/features/exams/api/examsApi';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { Spinner } from '@/components/common/Spinner';
import { useUiStore } from '@/store/useUiStore';

export function CourseDetailPage() {
  const { slug = '' } = useParams();
  const uid = useAuthStore((s) => s.profile?._id);
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);

  const courseQuery = useQuery({
    queryKey: ['course', slug],
    queryFn: () => coursesApi.getBySlug(slug),
  });
  const courseId = courseQuery.data?._id;

  const enrollmentsQuery = useQuery({
    queryKey: ['enrollments', uid],
    queryFn: () => coursesApi.listEnrolled(uid as string),
    enabled: Boolean(uid),
  });
  const isEnrolled = enrollmentsQuery.data?.enrollments.some(
    (e) => e.course._id === courseId && e.status === 'active'
  );

  const examsQuery = useQuery({
    queryKey: ['course-exams', courseId],
    queryFn: () => examsApi.listForCourse(courseId as string),
    enabled: Boolean(courseId),
  });

  const enrollMutation = useMutation({
    mutationFn: () => coursesApi.enroll(courseId as string),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrollments', uid] });
      pushToast('Enrolled! Your practice exams are unlocked below.', 'success');
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : 'Could not enroll', 'error'),
  });

  if (courseQuery.isLoading) return <Spinner />;
  if (!courseQuery.data) return <p className="text-red-600">Course not found.</p>;
  const course = courseQuery.data;

  return (
    <div className="mx-auto max-w-3xl">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-500">{course.category}</p>
      <h1 className="mb-2 text-3xl font-bold text-neutral-900 dark:text-neutral-100">{course.title}</h1>
      {course.description && <p className="mb-4 text-neutral-600 dark:text-neutral-400">{course.description}</p>}

      <div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-neutral-500">
        {course.instructorName && <span>By {course.instructorName}</span>}
        {course.ratingCount ? (
          <span>
            <span className="font-bold text-rating">{course.averageRating?.toFixed(1)}</span> ★ (
            {course.ratingCount.toLocaleString()} ratings)
          </span>
        ) : null}
        <span className="capitalize">{course.level}</span>
        {course.durationHours && <span>{course.durationHours}h</span>}
      </div>

      <div className="mb-8 flex items-center gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <span className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
          {course.isFree ? 'Free' : `$${course.price?.toFixed(2)}`}
        </span>
        {isEnrolled ? (
          <span className="rounded bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700">
            You&apos;re enrolled
          </span>
        ) : (
          <button
            type="button"
            onClick={() => enrollMutation.mutate()}
            disabled={enrollMutation.isPending || !uid}
            className="rounded bg-brand-500 px-5 py-2 font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {enrollMutation.isPending ? 'Enrolling…' : 'Enroll now'}
          </button>
        )}
      </div>

      <h2 className="mb-3 text-xl font-bold text-neutral-900 dark:text-neutral-100">This course includes</h2>
      {examsQuery.isLoading && <Spinner />}
      {examsQuery.data && examsQuery.data.length === 0 && (
        <p className="text-neutral-500">No exams published yet for this course.</p>
      )}
      <ul className="space-y-2">
        {examsQuery.data?.map((exam) => (
          <li
            key={exam._id}
            className="flex items-center justify-between rounded border border-neutral-200 p-3 dark:border-neutral-800"
          >
            <div>
              <p className="font-medium">{exam.title}</p>
              <p className="text-xs text-neutral-500">
                {exam.durationMinutes} min · {exam.totalMarks} marks · {exam.maxAttempts} attempt
                {exam.maxAttempts === 1 ? '' : 's'} allowed
              </p>
            </div>
            {isEnrolled ? (
              <Link
                to={`/exams/${exam._id}`}
                className="shrink-0 rounded bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-600"
              >
                Start
              </Link>
            ) : (
              <span className="shrink-0 text-xs text-neutral-400">Enroll to unlock</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
