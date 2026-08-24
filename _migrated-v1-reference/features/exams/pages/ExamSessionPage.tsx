import { useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { examsApi } from '../api/examsApi';
import { Spinner } from '@/components/common/Spinner';
import { formatDate } from '@/utils/formatDate';

// Demonstrates the start -> answer (see examsApi.submitAnswer) -> submit
// lifecycle against POST /exams/:examId/sessions and
// POST /exams/sessions/:sessionId/submit. The question-by-question runner
// UI (timer, navigation, flagging) is intentionally left as a follow-up —
// this proves the data flow, not the full exam-taking experience.
export function ExamSessionPage() {
  const { examId = '' } = useParams();

  const examQuery = useQuery({ queryKey: ['exam', examId], queryFn: () => examsApi.getExam(examId) });
  const startSession = useMutation({ mutationFn: () => examsApi.startSession(examId) });

  if (examQuery.isLoading) return <Spinner />;
  if (examQuery.isError || !examQuery.data) return <p className="text-red-600">Couldn&apos;t load this exam.</p>;

  const { exam } = examQuery.data;

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">{exam.title}</h1>
      <p className="mb-6 text-neutral-500">
        {exam.durationMinutes} minutes · {exam.totalMarks} marks
      </p>

      {startSession.data ? (
        <p className="rounded border border-brand-500 bg-brand-50 p-4 text-brand-600">
          Session started — {startSession.data.session.totalQuestions} questions, expires{' '}
          {formatDate(startSession.data.session.expiresAt)}.
        </p>
      ) : (
        <button
          type="button"
          onClick={() => startSession.mutate()}
          disabled={startSession.isPending}
          className="rounded bg-brand-500 px-4 py-2 font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {startSession.isPending ? 'Starting…' : 'Start exam'}
        </button>
      )}
    </div>
  );
}
