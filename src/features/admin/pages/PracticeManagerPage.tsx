import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { contentAdminApi, type PracticeTestSummary } from '../api/contentAdminApi';
import { PracticeTestFormCard } from '../components/PracticeTestFormCard';
import { useUiStore } from '@/store/useUiStore';
import { toDate } from '@/utils/formatDate';

// availableFrom/Until arrive over JSON as a serialized Firestore Timestamp
// ({ _seconds, _nanoseconds }, not { seconds }) — toDate() handles that
// shape; a bare `ts.seconds * 1000` silently produced an Invalid Date here.
function formatDate(ts: unknown): string {
  return toDate(ts).toLocaleDateString();
}

function isExpired(test: PracticeTestSummary): boolean {
  return toDate(test.availableUntil).getTime() < Date.now();
}

export function PracticeManagerPage() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const [editingTest, setEditingTest] = useState<PracticeTestSummary | null>(null);

  const { data } = useQuery({ queryKey: ['admin', 'practiceTests'], queryFn: contentAdminApi.listPracticeTestsAdmin });
  const tests = data?.practiceTests ?? [];

  const deleteMutation = useMutation({
    mutationFn: (testId: string) => contentAdminApi.deletePracticeTest(testId),
    onSuccess: () => {
      pushToast('Practice test deleted', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'practiceTests'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'dashboardStats'] });
    },
    onError: () => pushToast('Could not delete practice test', 'error'),
  });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-ink">Practice Exams</h1>
      <p className="mb-6 text-sm text-ink-faint">Configure batch-based practice sessions with resume and reattempt workflows.</p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          {/* key forces a fresh mount whenever which test is being edited
              changes (including switching to/from "create" mode) — same fix
              as ExamQuizStudioPage's QuizFormCard, same underlying cause. */}
          <PracticeTestFormCard key={editingTest?.id ?? 'new'} editingTest={editingTest} onDoneEditing={() => setEditingTest(null)} />

          <div className="rounded-xl border border-surface-border bg-surface-raised p-6">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink">📖 How Practice Mode Works</h2>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink-faint">
              <li>Upload a large question bank (any size).</li>
              <li>Set an availability window: students can only access within these dates.</li>
              <li>Initial batch size sets how many questions the first session delivers.</li>
              <li>Students can resume anytime: only unanswered questions are shown, and they pick how many each session.</li>
              <li>Immediate answer feedback is always ON in practice mode.</li>
              <li>Students can reattempt their last batch to reinforce weak areas.</li>
            </ol>
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-faint">Your Practice Exams</h2>
          <div className="space-y-3">
            {tests.length === 0 && (
              <p className="rounded-lg border border-dashed border-surface-border p-4 text-sm text-ink-faint">
                No practice tests yet.
              </p>
            )}
            {tests.map((test) => (
              <div key={test.id} className="rounded-xl border border-surface-border bg-surface-raised p-4">
                <div className="mb-2 flex items-start justify-between">
                  <h3 className="font-bold text-ink">{test.title}</h3>
                  {isExpired(test) && (
                    <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-ink-faint">Expired</span>
                  )}
                </div>
                <div className="space-y-0.5 text-sm text-ink-faint">
                  <div>Questions: {test.totalQuestions}</div>
                  <div>Session: {test.durationPerSessionMinutes} min</div>
                  <div>
                    From {formatDate(test.availableFrom)} to {formatDate(test.availableUntil)}
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <Link
                    to={`/admin/practice-tests/${test.id}/view`}
                    className="rounded-lg bg-[#1D4ED8] px-3 py-1.5 text-sm font-medium text-white"
                  >
                    View
                  </Link>
                  <button
                    type="button"
                    onClick={() => setEditingTest(test)}
                    className="rounded-lg border border-surface-border px-3 py-1.5 text-sm text-ink-muted"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Delete "${test.title}"? This cannot be undone.`)) deleteMutation.mutate(test.id);
                    }}
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
    </div>
  );
}
