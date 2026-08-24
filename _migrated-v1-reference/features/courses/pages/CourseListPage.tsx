import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { coursesApi } from '../api/coursesApi';
import { CourseCard } from '../components/CourseCard';
import { CourseRow } from '../components/CourseRow';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { Spinner } from '@/components/common/Spinner';
import type { Course } from '@/types/api';

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function CourseListPage() {
  const profile = useAuthStore((s) => s.profile);
  const uid = profile?._id;

  const enrolledQuery = useQuery({
    queryKey: ['enrollments', uid],
    queryFn: () => coursesApi.listEnrolled(uid as string),
    enabled: Boolean(uid),
  });

  const catalogQuery = useQuery({
    queryKey: ['catalog'],
    queryFn: () => coursesApi.listPublished(),
  });
  const catalog = catalogQuery.data;

  const byCategory = useMemo(() => {
    const groups = new Map<string, Course[]>();
    for (const course of catalog ?? []) {
      const list = groups.get(course.category) ?? [];
      list.push(course);
      groups.set(course.category, list);
    }
    return groups;
  }, [catalog]);

  const activeEnrollments = (enrolledQuery.data?.enrollments ?? []).filter((e) => e.status === 'active');

  return (
    <div>
      <header className="mb-10 flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-sm font-semibold text-white dark:bg-neutral-100 dark:text-neutral-900">
          {profile ? initials(profile.name) : '—'}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
            Welcome{profile ? `, ${profile.name.split(' ')[0]}` : ''}
          </h1>
          <p className="text-sm text-neutral-500">What certification are you working toward next?</p>
        </div>
      </header>

      {enrolledQuery.isLoading ? (
        <Spinner />
      ) : (
        activeEnrollments.length > 0 && (
          <section className="mb-10">
            <h2 className="mb-3 text-xl font-bold text-neutral-900 dark:text-neutral-100">Continue learning</h2>
            <div className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:none] snap-x">
              {activeEnrollments.map((enrollment) => (
                <Link
                  key={enrollment._id}
                  to={`/courses/${enrollment.course.slug}`}
                  className="w-64 shrink-0 snap-start rounded-lg border border-neutral-200 bg-white p-4 hover:shadow-lg dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <h3 className="mb-2 line-clamp-2 text-sm font-semibold">{enrollment.course.title}</h3>
                  <div className="h-1.5 rounded-full bg-neutral-200 dark:bg-neutral-800">
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{ width: `${enrollment.progressPercent}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">{enrollment.progressPercent}% complete</p>
                </Link>
              ))}
            </div>
          </section>
        )
      )}

      <h2 className="mb-1 text-2xl font-bold text-neutral-900 dark:text-neutral-100">Explore certifications</h2>
      <p className="mb-6 text-sm text-neutral-500">Practice exams and prep courses across every track</p>

      {catalogQuery.isLoading && <Spinner />}
      {catalogQuery.isError && <p className="text-red-600">Couldn&apos;t load the course catalog.</p>}
      {catalogQuery.data && catalogQuery.data.length === 0 && (
        <p className="text-neutral-500">No courses are published yet — check back soon.</p>
      )}

      {[...byCategory.entries()].map(([category, courses]) => (
        <CourseRow key={category} title={`Top courses in ${category}`}>
          {courses.map((course) => <CourseCard key={course._id} course={course} />)}
        </CourseRow>
      ))}
    </div>
  );
}
