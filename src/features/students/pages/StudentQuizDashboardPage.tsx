import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { resultsApi } from '@/features/admin/api/resultsApi';

// Reuses the same "Student Results" table shape as the admin Performance
// page, scoped to just the signed-in student's own attempt (their rank
// within the full leaderboard, but only their own row is returned/shown).
export function StudentQuizDashboardPage() {
  const { quizId } = useParams<{ quizId: string }>();
  const { data, isLoading } = useQuery({
    queryKey: ['student', 'myResult', quizId],
    queryFn: () => resultsApi.getMyResultForQuiz(quizId!),
    enabled: !!quizId,
  });

  return (
    <div>
      <Link to="/home/past-quizzes" className="mb-4 inline-block text-sm text-brand-400">
        ← Back to Past Quizzes
      </Link>
      <h1 className="mb-1 text-2xl font-semibold text-white">Student Dashboard</h1>
      {isLoading && <p className="text-neutral-400">Loading…</p>}
      {data && (
        <>
          <p className="mb-4 text-sm text-neutral-500">{data.attempt.quizTitle}</p>
          <div className="overflow-x-auto rounded-xl border border-surface-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-black/20 text-xs uppercase tracking-wide text-neutral-500">
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
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-surface-border">
                  <td className="px-4 py-3">{data.attempt.rank}</td>
                  <td className="px-4 py-3 text-white">{data.attempt.userName}</td>
                  <td className="px-4 py-3">{data.attempt.totalQuestions}</td>
                  <td className="px-4 py-3">{data.attempt.answeredCount}</td>
                  <td className="px-4 py-3">{data.attempt.notAnsweredCount}</td>
                  <td className="px-4 py-3">{data.attempt.incorrectCount}</td>
                  <td className="px-4 py-3">{data.attempt.correctCount}</td>
                  <td className="px-4 py-3 font-semibold text-brand-300">{data.attempt.marks}</td>
                  <td className="px-4 py-3">{Math.round(data.attempt.durationSeconds / 60)} min</td>
                  <td className="px-4 py-3">{data.attempt.exitCount}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
