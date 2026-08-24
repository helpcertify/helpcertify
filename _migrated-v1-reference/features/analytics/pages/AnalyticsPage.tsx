import { useQuery } from '@tanstack/react-query';
import { callAction } from '@/lib/vercelApi';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { Spinner } from '@/components/common/Spinner';

interface PerformanceSummary {
  summary: { attemptCount: number; avgPercentage: number; bestPercentage: number; passCount: number };
  weakestTopics: { tag: string; avgAccuracy: number }[];
}

// Instructor/admin landing view — the signed-in staff member's own
// performance snapshot as a worked example of a staff-scoped action (course
// completion, question difficulty, exam time-analysis are the same pattern
// — see frontend/api/analytics.ts).
export function AnalyticsPage() {
  const uid = useAuthStore((s) => s.profile?._id);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['performance', uid],
    queryFn: () => callAction<PerformanceSummary>('analytics', 'getStudentPerformance', { userId: uid as string }),
    enabled: Boolean(uid),
  });

  if (isLoading) return <Spinner />;
  if (isError) return <p className="text-red-600">Couldn&apos;t load performance data.</p>;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Analytics</h1>
      {data && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Attempts" value={data.summary.attemptCount} />
          <StatCard label="Average score" value={`${Math.round(data.summary.avgPercentage)}%`} />
          <StatCard label="Best score" value={`${Math.round(data.summary.bestPercentage)}%`} />
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
