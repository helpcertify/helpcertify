import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { resultsApi } from '@/features/admin/api/resultsApi';
import { getQuizById } from '../api/studentContentApi';

const SUBMITTED_STATUSES = ['submitted', 'auto_submitted'];

// jsPDF (certificate.ts) only fires for visitors who actually download a
// certificate — dynamically imported so it lands in its own lazy chunk
// instead of the one bundle this app ships, same pattern as
// PerformancePage.tsx's exportToExcel and PracticeTestsPage.tsx's own copy
// of this same wrapper.
async function downloadCertificate(...args: Parameters<typeof import('@/utils/certificate').downloadCertificate>) {
  const mod = await import('@/utils/certificate');
  return mod.downloadCertificate(...args);
}

export function PastQuizzesPage() {
  const { data } = useQuery({ queryKey: ['student', 'pastQuizzes'], queryFn: resultsApi.listResultsForStudent });
  const attempts = data?.attempts ?? [];

  // Certificate eligibility needs each quiz's own passMarkPercent (not
  // stored on the attempt itself) — fetched once per unique quizId here
  // rather than per row, and cached under a key derived from the id list so
  // it only refetches when the actual set of quizzes attempted changes.
  const quizIds = [...new Set(attempts.map((a) => a.quizId))];
  const { data: quizzesById } = useQuery({
    queryKey: ['student', 'quizzesForHistory', quizIds],
    queryFn: async () => {
      const results = await Promise.all(quizIds.map((id) => getQuizById(id)));
      return new Map(results.filter((q): q is NonNullable<typeof q> => !!q).map((q) => [q.id, q]));
    },
    enabled: quizIds.length > 0,
  });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-ink">My Attempts</h1>
      <p className="mb-6 text-sm text-ink-faint">Review your quiz history and performance</p>

      <div className="rounded-xl border border-surface-border bg-surface-raised">
        <div className="border-b border-surface-border px-6 py-4">
          <h2 className="flex items-center gap-2 font-bold text-ink">🕐 My Attempts</h2>
        </div>
        {attempts.length === 0 ? (
          <p className="p-6 text-sm text-ink-faint">You haven't attempted any quizzes yet.</p>
        ) : (
          <div className="divide-y divide-surface-border">
            {attempts.map((a) => {
              const quiz = quizzesById?.get(a.quizId);
              const passMark = quiz?.passMarkPercent ?? 60;
              const scorePercent = a.totalQuestions > 0 ? (a.correctCount / a.totalQuestions) * 100 : 0;
              const passed = SUBMITTED_STATUSES.includes(a.status) && scorePercent >= passMark;

              return (
                <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                  <div>
                    <div className="font-medium text-ink">{a.quizTitle}</div>
                    <div className="mt-1 flex flex-wrap gap-2 text-sm">
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-700 dark:text-emerald-400">Status: Attended</span>
                      <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-brand-ink">Score: {a.marks}</span>
                      {passed && (
                        <span className="rounded-full bg-[#f09907]/15 px-2 py-0.5 text-[#f09907]">🎓 Passed</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {passed && (
                      <button
                        type="button"
                        onClick={() =>
                          downloadCertificate({
                            studentName: a.userName,
                            itemTitle: a.quizTitle,
                            itemType: 'quiz',
                            category: quiz?.category ?? 'Other',
                            scoreLabel: `${Math.round(scorePercent)}% (${a.correctCount}/${a.totalQuestions} correct)`,
                            dateLabel: new Date().toLocaleDateString(),
                            certificateCode: a.id.slice(0, 8).toUpperCase(),
                          })
                        }
                        className="rounded-lg border border-brand-400 px-4 py-2 text-sm font-medium text-brand-ink hover:bg-brand-500/10"
                      >
                        🎓 Certificate
                      </button>
                    )}
                    <Link
                      to={`/home/past-quizzes/${a.quizId}`}
                      className="rounded-lg bg-[#1D4ED8] px-4 py-2 text-sm font-medium text-surface"
                    >
                      View Dashboard →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
