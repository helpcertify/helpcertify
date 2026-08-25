import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { resultsApi } from '@/features/admin/api/resultsApi';

export function PastQuizzesPage() {
  const { data } = useQuery({ queryKey: ['student', 'pastQuizzes'], queryFn: resultsApi.listResultsForStudent });
  const attempts = data?.attempts ?? [];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-ink">Quiz History</h1>
      <p className="mb-6 text-sm text-ink-faint">Review your quiz history and performance</p>

      <div className="rounded-xl border border-surface-border bg-surface-raised">
        <div className="border-b border-surface-border px-6 py-4">
          <h2 className="flex items-center gap-2 font-semibold text-ink">🕐 Quiz History</h2>
        </div>
        {attempts.length === 0 ? (
          <p className="p-6 text-sm text-ink-faint">You haven't attempted any quizzes yet.</p>
        ) : (
          <div className="divide-y divide-surface-border">
            {attempts.map((a) => (
              <div key={a.id} className="flex items-center justify-between px-6 py-4">
                <div>
                  <div className="font-medium text-ink">{a.quizTitle}</div>
                  <div className="mt-1 flex gap-2 text-sm">
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-400">Status: Attended</span>
                    <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-brand-ink">Score: {a.marks}</span>
                  </div>
                </div>
                <Link
                  to={`/home/past-quizzes/${a.quizId}`}
                  className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-medium text-surface"
                >
                  View Dashboard →
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
