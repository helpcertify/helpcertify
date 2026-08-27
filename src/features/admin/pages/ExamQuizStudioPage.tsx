import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { contentAdminApi, type QuizSummary } from '../api/contentAdminApi';
import { QuizFormCard } from '../components/QuizFormCard';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useUiStore } from '@/store/useUiStore';
import { toDate } from '@/utils/formatDate';

// scheduledStart arrives over JSON as a serialized Firestore Timestamp
// ({ _seconds, _nanoseconds }, not { seconds }) — toDate() handles that
// shape; a bare `ts.seconds * 1000` silently produced an Invalid Date here.
function formatTimestamp(ts: unknown): string | null {
  if (!ts) return null;
  return toDate(ts).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function ExamQuizStudioPage() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const [editingQuiz, setEditingQuiz] = useState<QuizSummary | null>(null);
  const [deletingQuiz, setDeletingQuiz] = useState<QuizSummary | null>(null);

  const { data } = useQuery({ queryKey: ['admin', 'quizzes'], queryFn: contentAdminApi.listQuizzesAdmin });
  const quizzes = data?.quizzes ?? [];
  const upcoming = quizzes.filter((q) => q.scheduledStart && toDate(q.scheduledStart).getTime() > Date.now());

  const deleteMutation = useMutation({
    mutationFn: (quizId: string) => contentAdminApi.deleteQuiz(quizId),
    onSuccess: () => {
      pushToast('Quiz deleted', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'quizzes'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'dashboardStats'] });
      setDeletingQuiz(null);
    },
    onError: () => pushToast('Could not delete quiz', 'error'),
  });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-ink">Mock Exams</h1>
      <p className="mb-6 text-sm text-ink-faint">Build production-ready real-test quizzes with strict timing and response behavior.</p>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total Quizzes" value={quizzes.length} />
        <StatCard label="Upcoming" value={upcoming.length} />
        <StatCard label="Published" value={quizzes.filter((q) => q.isPublished).length} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        {/* key forces a fresh mount whenever which quiz is being edited
            changes (including switching to/from "create" mode) — QuizFormCard
            seeds its fields from editingQuiz only in each useState's initial
            value, which React only reads once per mount. Without this key,
            clicking Edit reused the same mounted instance and every field
            stayed at whatever it was already showing. */}
        <QuizFormCard key={editingQuiz?.id ?? 'new'} editingQuiz={editingQuiz} onDoneEditing={() => setEditingQuiz(null)} />

        <div>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-faint">Your Quizzes</h2>
          <div className="space-y-3">
            {quizzes.length === 0 && (
              <p className="rounded-lg border border-dashed border-surface-border p-4 text-sm text-ink-faint">
                No quizzes yet. Publish one to see it here.
              </p>
            )}
            {quizzes.map((quiz) => (
              <div key={quiz.id} className="rounded-xl border border-surface-border bg-surface-raised p-4">
                <div className="mb-2 flex items-start justify-between">
                  <h3 className="font-bold text-ink">{quiz.title}</h3>
                  <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-xs text-brand-ink">
                    {quiz.isPublished ? 'Published' : 'Draft'}
                  </span>
                </div>
                <div className="space-y-0.5 text-sm text-ink-faint">
                  <div>Duration: {quiz.durationMinutes} min</div>
                  <div>Questions: {quiz.totalQuestions}</div>
                  {formatTimestamp(quiz.scheduledStart) && <div>Starts: {formatTimestamp(quiz.scheduledStart)}</div>}
                  <div>
                    Code: <span className="font-mono text-brand-ink">{quiz.code}</span>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <Link
                    to={`/admin/quizzes/${quiz.id}/view`}
                    className="rounded-lg bg-[#1D4ED8] px-3 py-1.5 text-sm font-medium text-white"
                  >
                    View
                  </Link>
                  <button
                    type="button"
                    onClick={() => setEditingQuiz(quiz)}
                    className="rounded-lg border border-surface-border px-3 py-1.5 text-sm text-ink-muted"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingQuiz(quiz)}
                    className="rounded-lg border border-surface-border px-3 py-1.5 text-sm text-ink-muted hover:border-red-500/50 hover:text-red-400"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!deletingQuiz}
        title={`Delete "${deletingQuiz?.title}"?`}
        message="This cannot be undone."
        confirmLabel={deleteMutation.isPending ? 'Deleting…' : 'Delete'}
        danger
        onConfirm={() => deletingQuiz && deleteMutation.mutate(deletingQuiz.id)}
        onCancel={() => setDeletingQuiz(null)}
      />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-raised p-5">
      <div className="text-xs uppercase tracking-wide text-ink-faint">{label}</div>
      <div className="mt-2 text-2xl font-bold text-ink">{value}</div>
    </div>
  );
}
