import { Link } from 'react-router-dom';
import clsx from 'clsx';
import type { Course } from '@/types/api';

// Deterministic per-category gradient + motif so cards without a real
// thumbnailUrl still look designed rather than blank — keyed by category so
// the same category always renders the same treatment across the catalog.
const CATEGORY_TREATMENTS: Record<string, { from: string; to: string }> = {
  Cybersecurity: { from: '#3a0d14', to: '#8a2332' },
  'Cloud Computing': { from: '#0b3a4a', to: '#1f7a99' },
  'Project Management': { from: '#3a2c0b', to: '#a9781f' },
  Networking: { from: '#122f1a', to: '#2f7a4d' },
  'Data & AI': { from: '#241a3a', to: '#5b3fa3' },
};
const DEFAULT_TREATMENT = { from: '#26292e', to: '#565c64' };

function Thumbnail({ course }: { course: Course }) {
  if (course.thumbnailUrl) {
    return <img src={course.thumbnailUrl} alt="" className="h-full w-full object-cover" />;
  }
  const treatment = CATEGORY_TREATMENTS[course.category] ?? DEFAULT_TREATMENT;
  return (
    <div
      className="flex h-full w-full items-center justify-center"
      style={{ background: `linear-gradient(135deg, ${treatment.from}, ${treatment.to})` }}
    >
      <svg viewBox="0 0 64 64" className="h-12 w-12 opacity-80" aria-hidden="true">
        <path
          d="M32 8l18 8v13c0 12.7-7.7 22.1-18 24.7C21.7 51.1 14 41.7 14 29V16l18-8z"
          fill="none"
          stroke="white"
          strokeWidth="2.5"
        />
        <path d="M24 31l6 6 11-12" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function StarRating({ rating, count }: { rating: number; count: number }) {
  return (
    <div className="flex items-center gap-1 text-sm">
      <span className="font-bold text-rating">{rating.toFixed(1)}</span>
      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-rating" aria-hidden="true">
        <path d="M10 1.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z" />
      </svg>
      <span className="text-neutral-400">({count.toLocaleString()})</span>
    </div>
  );
}

export function CourseCard({ course }: { course: Course }) {
  const rating = course.averageRating ?? 0;
  const ratingCount = course.ratingCount ?? 0;
  const isCertificationTrack = course.tags?.includes('certification') ?? false;

  return (
    <Link
      to={`/courses/${course.slug}`}
      className="group flex w-64 shrink-0 snap-start flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white transition-shadow hover:shadow-lg dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="aspect-video w-full overflow-hidden">
        <Thumbnail course={course} />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-neutral-900 group-hover:text-brand-500 dark:text-neutral-100">
          {course.title}
        </h3>
        {course.instructorName && <p className="text-xs text-neutral-500">{course.instructorName}</p>}
        {ratingCount > 0 && <StarRating rating={rating} count={ratingCount} />}
        <div className="mt-1 flex items-center gap-2">
          {course.isFree ? (
            <span className="text-base font-bold text-neutral-900 dark:text-neutral-100">Free</span>
          ) : (
            <span className="text-base font-bold text-neutral-900 dark:text-neutral-100">
              ${course.price?.toFixed(2)}
            </span>
          )}
        </div>
        <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
          <span
            className={clsx(
              'rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
              course.level === 'advanced' && 'bg-brand-50 text-brand-600',
              course.level === 'intermediate' && 'bg-amber-50 text-amber-700',
              course.level === 'beginner' && 'bg-emerald-50 text-emerald-700'
            )}
          >
            {course.level}
          </span>
          {isCertificationTrack && (
            <span className="rounded bg-neutral-900 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white dark:bg-neutral-100 dark:text-neutral-900">
              Certification
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
