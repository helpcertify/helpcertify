import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toDate } from '@/utils/formatDate';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { PrimaryGoalStatRow } from '../components/PrimaryGoalStatRow';
import { ExamBrowsePage } from '../components/exam';
import { usePracticeSeries } from '../hooks/useExamSeries';

// Practice Exams browse page: a responsive certification card grid (one
// card per certification, deduped across packages) with All / Available /
// In Progress / Completed filters, search and a grid/list toggle. Each
// card opens the per-certification detail page. The resume banner and the
// study-goal stat row are kept above the grid.
export function PracticeTestsPage() {
  const uid = useAuthStore((s) => s.firebaseUser?.uid);
  const { series, isLoading, isError, refetch } = usePracticeSeries();

  const { data: openSession } = useQuery({
    queryKey: ['student', 'openPracticeSession', uid],
    enabled: !!uid,
    queryFn: async () => {
      const snap = await getDocs(query(collection(db, 'practiceSessions'), where('userId', '==', uid)));
      const open = snap.docs
        .map((d) => {
          const x = d.data();
          return {
            testId: x.testId as string,
            status: x.status as string,
            answeredCount: (x.answeredCount as number) ?? 0,
            batchSize: ((x.batchQuestionIds as string[]) ?? []).length,
            startedAt: toDate(x.startedAt),
          };
        })
        .filter((s) => s.status === 'in_progress')
        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
      return open[0] ?? null;
    },
  });

  const resumeLabel = (() => {
    if (!openSession) return null;
    for (const s of series) {
      const set = s.sets.find((x) => x.itemId === openSession.testId);
      if (set) return `${s.cert.name} Practice Exam ${String(set.index).padStart(2, '0')}`;
    }
    return null;
  })();

  return (
    <ExamBrowsePage
      kind="practice"
      title="Practice Exams"
      subtitle="Practice at your own pace, review answers and strengthen your knowledge."
      series={series}
      isLoading={isLoading}
      isError={isError}
      onRetry={refetch}
      detailBase="/home/practice-tests/series"
      topSlot={
        <div className="mb-5 space-y-5">
          {openSession && resumeLabel && (
            <Link
              to={`/practice-tests/${openSession.testId}/take`}
              className="flex items-center justify-between gap-4 rounded-xl border border-brand-500/30 bg-brand-50 px-5 py-4 hover:bg-brand-500/10 dark:bg-brand-500/10"
            >
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-brand-ink">Continue where you left off</div>
                <div className="mt-0.5 text-sm font-semibold text-ink">{resumeLabel}</div>
                <div className="text-xs text-ink-faint">
                  {openSession.answeredCount} of {openSession.batchSize} questions answered
                </div>
              </div>
              <span className="shrink-0 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white">Resume &rarr;</span>
            </Link>
          )}
          <PrimaryGoalStatRow />
        </div>
      }
    />
  );
}
