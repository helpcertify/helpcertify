import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { contentAdminApi } from '../api/contentAdminApi';
import { toDate } from '@/utils/formatDate';

// Read-only Q&A preview with the correct option highlighted — matches the
// reference screenshots' "quiz-detailsview" (reached via a quiz's View button).
export function QuizAnswerKeyPage() {
  const { quizId } = useParams<{ quizId: string }>();
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'quizAnswerKey', quizId],
    queryFn: () => contentAdminApi.getQuizAnswerKey(quizId!),
    enabled: !!quizId,
  });

  if (isLoading) return <p className="text-neutral-400">Loading…</p>;
  if (!data) return <p className="text-neutral-400">Quiz not found.</p>;

  const { quiz, questions } = data;

  return (
    <div>
      <Link to="/admin/quizzes" className="mb-4 inline-block text-sm text-brand-400">
        ← Back to Exam Quiz Studio
      </Link>
      <div className="rounded-xl border border-surface-border bg-surface-raised p-6">
        <h1 className="text-2xl font-semibold text-white">{quiz.title}</h1>
        <div className="mt-1 space-y-0.5 text-sm text-neutral-500">
          <div>Duration: {quiz.durationMinutes} minutes</div>
          {Boolean(quiz.scheduledStart) && <div>Test Timing: {toDate(quiz.scheduledStart).toLocaleString()}</div>}
        </div>

        <div className="mt-6 space-y-6">
          {questions.map((q, i) => (
            <div key={q.id}>
              <h3 className="mb-2 font-semibold text-white">
                Q{i + 1}: {q.questionText}
              </h3>
              <ul className="space-y-1 pl-1">
                {q.options.map((opt) => (
                  <li
                    key={opt.id}
                    className={opt.id === q.correctOptionId ? 'font-medium text-emerald-400' : 'text-neutral-300'}
                  >
                    • {opt.text}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
