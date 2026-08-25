import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { contentAdminApi } from '../api/contentAdminApi';
import { QuestionEditorList } from '../components/QuestionEditorList';
import { useUiStore } from '@/store/useUiStore';
import { toDate } from '@/utils/formatDate';

// Answer-key preview with the correct option highlighted — matches the
// reference screenshots' "quiz-details view" (reached via a quiz's View
// button) — plus inline editing per question, so fixing a typo or a wrong
// answer doesn't require re-uploading the whole .docx.
export function QuizAnswerKeyPage() {
  const { quizId } = useParams<{ quizId: string }>();
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'quizAnswerKey', quizId],
    queryFn: () => contentAdminApi.getQuizAnswerKey(quizId!),
    enabled: !!quizId,
  });

  if (isLoading) return <p className="text-ink-faint">Loading…</p>;
  if (!data) return <p className="text-ink-faint">Quiz not found.</p>;

  const { quiz, questions } = data;

  return (
    <div>
      <Link to="/admin/quizzes" className="mb-4 inline-block text-sm text-brand-ink">
        ← Back to Question Bank
      </Link>
      <div className="rounded-xl border border-surface-border bg-surface-raised p-6">
        <h1 className="text-2xl font-bold text-ink">{quiz.title}</h1>
        <div className="mt-1 space-y-0.5 text-sm text-ink-faint">
          <div>Duration: {quiz.durationMinutes} minutes</div>
          {Boolean(quiz.scheduledStart) && <div>Test Timing: {toDate(quiz.scheduledStart).toLocaleString()}</div>}
        </div>

        <QuestionEditorList
          questions={questions}
          onSave={async (questionId, saveData) => {
            try {
              await contentAdminApi.updateQuizQuestion({ quizId: quizId!, questionId, ...saveData });
              pushToast('Question updated', 'success');
              queryClient.invalidateQueries({ queryKey: ['admin', 'quizAnswerKey', quizId] });
            } catch (err) {
              pushToast(err instanceof Error ? err.message : 'Could not update question', 'error');
            }
          }}
        />
      </div>
    </div>
  );
}
