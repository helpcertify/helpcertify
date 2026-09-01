import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { resultsApi, certificatesApi } from '@/features/admin/api/resultsApi';
import { CertificateReadyPanel } from '@/components/common/CertificateReadyPanel';

// Reuses the same "Learner Results" table shape as the admin Performance
// page, scoped to just the signed-in learner's own attempt (their rank
// within the full leaderboard, but only their own row is returned/shown).
// Doubles as this quiz's results page - the certificate panel below issues
// (or idempotently re-fetches) a completion certificate the moment this
// page loads for a passed, submitted attempt; a not-yet-eligible attempt
// (still in progress, or below the pass mark) just never shows the panel,
// no error surfaced for that entirely expected case.
export function StudentQuizDashboardPage() {
  const { quizId } = useParams<{ quizId: string }>();
  const { data, isLoading } = useQuery({
    queryKey: ['student', 'myResult', quizId],
    queryFn: () => resultsApi.getMyResultForQuiz(quizId!),
    enabled: !!quizId,
  });

  const { data: certData } = useQuery({
    queryKey: ['student', 'certificate', 'quiz', quizId, data?.attempt.id],
    queryFn: () => certificatesApi.issueOrGetCertificate('quiz', quizId!, data!.attempt.id),
    enabled: !!quizId && !!data?.attempt.id,
    retry: false,
  });

  return (
    <div>
      <Link to="/home/past-quizzes" className="mb-4 inline-block text-sm text-brand-ink">
        ← Back to Past Quizzes
      </Link>
      <h1 className="mb-1 text-2xl font-bold text-ink">Learner Dashboard</h1>
      {isLoading && <p className="text-ink-faint">Loading…</p>}
      {certData && <CertificateReadyPanel certificate={certData.certificate} dashboardHref="/home" />}
      {data && (
        <>
          <p className="mb-4 text-sm text-ink-faint">{data.attempt.quizTitle}</p>
          <div className="overflow-x-auto rounded-xl border border-surface-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-black/20 text-xs uppercase tracking-wide text-ink-faint">
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
                  <td className="px-4 py-3 text-ink">{data.attempt.userName}</td>
                  <td className="px-4 py-3">{data.attempt.totalQuestions}</td>
                  <td className="px-4 py-3">{data.attempt.answeredCount}</td>
                  <td className="px-4 py-3">{data.attempt.notAnsweredCount}</td>
                  <td className="px-4 py-3">{data.attempt.incorrectCount}</td>
                  <td className="px-4 py-3">{data.attempt.correctCount}</td>
                  <td className="px-4 py-3 font-semibold text-brand-ink">{data.attempt.marks}</td>
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
