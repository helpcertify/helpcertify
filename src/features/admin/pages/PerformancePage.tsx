import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { contentAdminApi } from '../api/contentAdminApi';
import { resultsApi, type AttemptRow } from '../api/resultsApi';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useUiStore } from '@/store/useUiStore';

// exceljs is a large dependency only needed when an admin actually clicks
// Export - dynamic import keeps it out of the main app bundle entirely.
async function exportResultsToExcel(...args: Parameters<typeof import('@/lib/exportToExcel').exportResultsToExcel>) {
  const mod = await import('@/lib/exportToExcel');
  return mod.exportResultsToExcel(...args);
}

export function PerformancePage() {
  const pushToast = useUiStore((s) => s.pushToast);
  const queryClient = useQueryClient();
  const [selectedQuizId, setSelectedQuizId] = useState<string | null>(null);
  const [deletingAttempt, setDeletingAttempt] = useState<AttemptRow | null>(null);

  const { data: quizData } = useQuery({ queryKey: ['admin', 'quizzes'], queryFn: contentAdminApi.listQuizzesAdmin });
  const quizzes = quizData?.quizzes ?? [];
  const activeQuizId = selectedQuizId ?? quizzes[0]?.id ?? null;
  const activeQuiz = quizzes.find((q) => q.id === activeQuizId);

  const { data: resultsData } = useQuery({
    queryKey: ['admin', 'results', activeQuizId],
    queryFn: () => resultsApi.listResultsForQuiz(activeQuizId!),
    enabled: !!activeQuizId,
  });
  const attempts = resultsData?.attempts ?? [];

  const deleteMutation = useMutation({
    mutationFn: (attemptId: string) => resultsApi.deleteAttempt(attemptId),
    onSuccess: () => {
      pushToast('Attempt deleted', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'results', activeQuizId] });
      setDeletingAttempt(null);
    },
    onError: () => pushToast('Could not delete attempt', 'error'),
  });

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_2.5fr]">
      <div>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-faint">Your Quizzes</h2>
        <div className="space-y-2">
          {quizzes.length === 0 && <p className="text-sm text-ink-faint">No quizzes published yet.</p>}
          {quizzes.map((q) => (
            <button
              key={q.id}
              type="button"
              onClick={() => setSelectedQuizId(q.id)}
              className={`w-full rounded-xl border p-4 text-left ${
                q.id === activeQuizId ? 'border-brand-400 bg-brand-500/10' : 'border-surface-border bg-surface-raised'
              }`}
            >
              <div className="font-semibold text-ink">{q.title}</div>
              <div className="text-xs text-ink-faint">{q.totalQuestions} questions</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-1 text-lg font-bold text-ink">Learner Results</h2>
        <p className="mb-4 text-sm text-ink-faint">{activeQuiz?.title ?? 'Select a quiz'}</p>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={attempts.length === 0}
            onClick={() => exportResultsToExcel(activeQuiz?.title ?? 'quiz', attempts)}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-surface disabled:opacity-50"
          >
            ↓ Export to Excel
          </button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-surface-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-sunken text-ink-faint text-xs uppercase tracking-wide text-ink-faint">
              <tr>
                <th className="px-4 py-3">Rank</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Questions</th>
                <th className="px-4 py-3">Answered</th>
                <th className="px-4 py-3">Not Answered</th>
                <th className="px-4 py-3">Incorrect</th>
                <th className="px-4 py-3">Correct</th>
                <th className="px-4 py-3">Marks</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Exits</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {attempts.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-6 text-center text-ink-faint">
                    No attempts yet.
                  </td>
                </tr>
              )}
              {attempts.map((a) => (
                <tr key={a.id} className="border-t border-surface-border">
                  <td className="px-4 py-3">{a.rank}</td>
                  <td className="px-4 py-3 text-ink">{a.userName}</td>
                  <td className="px-4 py-3">{a.totalQuestions}</td>
                  <td className="px-4 py-3">{a.answeredCount}</td>
                  <td className="px-4 py-3">{a.notAnsweredCount}</td>
                  <td className="px-4 py-3">{a.incorrectCount}</td>
                  <td className="px-4 py-3">{a.correctCount}</td>
                  <td className="px-4 py-3 font-semibold text-brand-ink">{a.marks}</td>
                  <td className="px-4 py-3">{Math.round(a.durationSeconds / 60)} min</td>
                  <td className="px-4 py-3">{a.exitCount}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setDeletingAttempt(a)}
                      className="rounded-lg border border-surface-border px-2 py-1 text-xs text-ink-muted hover:border-red-500/50 hover:text-red-400"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={!!deletingAttempt}
        title={`Delete ${deletingAttempt?.userName}'s attempt?`}
        message="This cannot be undone."
        confirmLabel={deleteMutation.isPending ? 'Deleting…' : 'Delete'}
        danger
        onConfirm={() => deletingAttempt && deleteMutation.mutate(deletingAttempt.id)}
        onCancel={() => setDeletingAttempt(null)}
      />
    </div>
  );
}
