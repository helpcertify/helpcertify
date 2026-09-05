import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useMyQuizAttempts } from '../hooks/useMyQuizAttempts';
import { useMyInProgressPracticeSessions } from '../hooks/useMyInProgressPracticeSessions';
import { courseApi } from '../api/courseApi';
import { mergeResumeItems } from '../lib/resumeItems';

// "Jump back in" - the one obvious place for a returning learner to
// continue. Merges in-progress mock attempts, in-progress practice
// sessions and unfinished courses into a single recency-sorted row. Shows
// nothing at all when there is nothing to resume.
export function JumpBackIn() {
  const { data: quizAttempts } = useMyQuizAttempts();
  const { data: practiceSessions } = useMyInProgressPracticeSessions();
  const { data: courseProgress } = useQuery({
    queryKey: ['student', 'myCourseProgress'],
    queryFn: courseApi.listMyProgress,
  });

  const items = mergeResumeItems(
    quizAttempts ?? [],
    practiceSessions ?? [],
    courseProgress?.items ?? [],
  ).slice(0, 6);

  if (items.length === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="mb-3 text-lg font-bold text-ink">Jump back in</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {items.map((item) => (
          <div
            key={`${item.kind}_${item.id}`}
            className="flex flex-col rounded-xl border border-surface-border bg-surface-raised p-4"
          >
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              {item.kind === 'quiz' ? 'Mock exam' : item.kind === 'practice' ? 'Practice exam' : 'Course'}
            </div>
            <div className="mb-2 line-clamp-2 font-semibold text-ink">{item.title}</div>
            <div className="mb-1 text-xs text-ink-faint">{item.subtitle}</div>
            <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-black/10">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${item.progressPct}%` }} />
            </div>
            <Link
              to={item.href}
              className="mt-auto block rounded-lg bg-brand-500 py-1.5 text-center text-sm font-semibold text-white transition-colors hover:bg-brand-600"
            >
              Resume
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
