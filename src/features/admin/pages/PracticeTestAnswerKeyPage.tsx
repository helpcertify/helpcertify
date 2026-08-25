import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { contentAdminApi } from '../api/contentAdminApi';
import { QuestionEditorList } from '../components/QuestionEditorList';
import { useUiStore } from '@/store/useUiStore';

// Practice Manager had no "View" page at all before this — the answer key
// was only reachable for quizzes. Same treatment as QuizAnswerKeyPage:
// read-only preview plus inline per-question editing.
export function PracticeTestAnswerKeyPage() {
  const { testId } = useParams<{ testId: string }>();
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'practiceTestAnswerKey', testId],
    queryFn: () => contentAdminApi.getPracticeTestAnswerKey(testId!),
    enabled: !!testId,
  });

  if (isLoading) return <p className="text-ink-faint">Loading…</p>;
  if (!data) return <p className="text-ink-faint">Practice test not found.</p>;

  const { practiceTest, questions } = data;

  return (
    <div>
      <Link to="/admin/practice-tests" className="mb-4 inline-block text-sm text-brand-ink">
        ← Back to Practice Manager
      </Link>
      <div className="rounded-xl border border-surface-border bg-surface-raised p-6">
        <h1 className="text-2xl font-bold text-ink">{practiceTest.title}</h1>
        <div className="mt-1 space-y-0.5 text-sm text-ink-faint">
          <div>Session duration: {practiceTest.durationPerSessionMinutes} minutes</div>
          <div>Default initial batch size: {practiceTest.defaultInitialBatchSize}</div>
        </div>

        <QuestionEditorList
          questions={questions}
          onSave={async (questionId, saveData) => {
            try {
              await contentAdminApi.updatePracticeTestQuestion({ testId: testId!, questionId, ...saveData });
              pushToast('Question updated', 'success');
              queryClient.invalidateQueries({ queryKey: ['admin', 'practiceTestAnswerKey', testId] });
            } catch (err) {
              pushToast(err instanceof Error ? err.message : 'Could not update question', 'error');
            }
          }}
        />
      </div>
    </div>
  );
}
