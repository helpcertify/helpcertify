import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { resultsApi, certificatesApi } from '@/features/admin/api/resultsApi';
import { getQuizById, getPracticeTestById } from '../api/studentContentApi';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { useUiStore } from '@/store/useUiStore';
import { errorText } from '@/lib/errorMessages';
import { toDate } from '@/utils/formatDate';
import { isPracticeTestCertificateEligible, computeCompletionPercent } from '../lib/certificateEligibility';
import { summarizePracticeAttempts } from '../lib/practiceAttemptHistory';

const SUBMITTED_STATUSES = ['submitted', 'auto_submitted'];

export function PastQuizzesPage() {
  const uid = useAuthStore((s) => s.firebaseUser?.uid);
  const pushToast = useUiStore((s) => s.pushToast);
  const { data } = useQuery({ queryKey: ['student', 'pastQuizzes'], queryFn: resultsApi.listResultsForStudent });
  const attempts = data?.attempts ?? [];
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Certificate eligibility needs each quiz's own passMarkPercent (not
  // stored on the attempt itself) - fetched once per unique quizId here
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

  // Practice Exams have no discrete "submit" the way a quiz does - a
  // learner practices the same bank across many sessions over time, so the
  // real record of "did I attempt this" is practiceProgress (one doc per
  // learner per test, updated on every answer - see PracticeProgressDoc).
  // Read directly (same pattern ProfileActivitySections already uses),
  // then only keep tests with at least one real answer - a doc can exist
  // with an empty answeredQuestionIds in edge cases, and that's not an
  // attempt.
  const { data: practiceProgressDocs } = useQuery({
    queryKey: ['student', 'practiceProgressFull', uid],
    queryFn: async () => {
      const snap = await getDocs(query(collection(db, 'practiceProgress'), where('userId', '==', uid)));
      return summarizePracticeAttempts(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            testId: data.testId as string,
            answeredQuestionIds: data.answeredQuestionIds as string[] | undefined,
            incorrectQuestionIds: data.incorrectQuestionIds as string[] | undefined,
            updatedAt: data.updatedAt,
          };
        }),
      );
    },
    enabled: !!uid,
  });
  const practiceAttempts = practiceProgressDocs ?? [];

  const practiceTestIds = [...new Set(practiceAttempts.map((p) => p.testId))];
  const { data: practiceTestsById } = useQuery({
    queryKey: ['student', 'practiceTestsForHistory', practiceTestIds],
    queryFn: async () => {
      const results = await Promise.all(practiceTestIds.map((id) => getPracticeTestById(id)));
      return new Map(results.filter((t): t is NonNullable<typeof t> => !!t).map((t) => [t.id, t]));
    },
    enabled: practiceTestIds.length > 0,
  });

  // Real, server-issued certificate - never the old client-only jsPDF
  // generator (fabricated a "certificate id" from a truncated attempt id,
  // no persistence, no ownership check, no verification). Idempotent:
  // issuing again for the same attempt just returns the same certificate.
  const handleDownloadCertificate = async (downloadKey: string, sourceType: 'quiz' | 'practiceTest', sourceId: string, attemptId?: string) => {
    setDownloadingId(downloadKey);
    try {
      const { certificate } = await certificatesApi.issueOrGetCertificate(sourceType, sourceId, attemptId);
      await certificatesApi.downloadCertificatePdf(certificate.id);
    } catch (err) {
      pushToast(errorText(err, 'Could not download the certificate'), 'error');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-ink">My Attempts</h1>
      <p className="mb-6 text-sm text-ink-faint">Review your Mock Exam and Practice Exam history and performance</p>

      <div className="mb-6 rounded-xl border border-surface-border bg-surface-raised">
        <div className="border-b border-surface-border px-6 py-4">
          <h2 className="flex items-center gap-2 font-bold text-ink">🕐 Mock Exams</h2>
        </div>
        {attempts.length === 0 ? (
          <p className="p-6 text-sm text-ink-faint">You haven't attempted any mock exams yet.</p>
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
                        <span className="rounded-full bg-warning/15 px-2 py-0.5 text-warning">🎓 Passed</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {passed && (
                      <button
                        type="button"
                        disabled={downloadingId === a.id}
                        onClick={() => handleDownloadCertificate(a.id, 'quiz', a.quizId, a.id)}
                        className="rounded-lg border border-brand-400 px-4 py-2 text-sm font-medium text-brand-ink hover:bg-brand-500/10 disabled:opacity-50"
                      >
                        {downloadingId === a.id ? 'Preparing…' : '🎓 Certificate'}
                      </button>
                    )}
                    <Link
                      to={`/home/past-quizzes/${a.quizId}`}
                      className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-surface"
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

      <div className="rounded-xl border border-surface-border bg-surface-raised">
        <div className="border-b border-surface-border px-6 py-4">
          <h2 className="flex items-center gap-2 font-bold text-ink">🕐 Practice Exams</h2>
        </div>
        {practiceAttempts.length === 0 ? (
          <p className="p-6 text-sm text-ink-faint">You haven't attempted any practice exams yet.</p>
        ) : (
          <div className="divide-y divide-surface-border">
            {practiceAttempts.map((p) => {
              const test = practiceTestsById?.get(p.testId);
              const totalQuestions = test?.totalQuestions ?? 0;
              const completionPercent = computeCompletionPercent(p.answeredCount, totalQuestions);
              const correctCount = p.answeredCount - p.incorrectCount;
              const accuracyPercent = p.answeredCount > 0 ? Math.round((correctCount / p.answeredCount) * 100) : null;
              const inProgress = totalQuestions > 0 && p.answeredCount < totalQuestions;
              const eligible = isPracticeTestCertificateEligible({
                answeredCount: p.answeredCount,
                totalQuestions,
                incorrectCount: p.incorrectCount,
              });
              const downloadKey = `practiceTest_${p.testId}`;

              return (
                <div key={p.testId} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                  <div>
                    <div className="font-medium text-ink">{test?.title ?? 'Practice Exam'}</div>
                    <div className="mt-1 flex flex-wrap gap-2 text-sm">
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-700 dark:text-emerald-400">
                        Status: {inProgress ? 'In Progress' : 'Complete'}
                      </span>
                      <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-brand-ink">
                        Progress: {p.answeredCount}/{totalQuestions || '?'} ({completionPercent}%)
                      </span>
                      {accuracyPercent !== null && (
                        <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-brand-ink">Accuracy: {accuracyPercent}%</span>
                      )}
                      {eligible && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-warning">🎓 Passed</span>}
                    </div>
                    {toDate(p.lastPracticedAt).getTime() > 0 && (
                      <div className="mt-1 text-xs text-ink-faint">Last practiced {toDate(p.lastPracticedAt).toLocaleDateString()}</div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {eligible && (
                      <button
                        type="button"
                        disabled={downloadingId === downloadKey}
                        onClick={() => handleDownloadCertificate(downloadKey, 'practiceTest', p.testId)}
                        className="rounded-lg border border-brand-400 px-4 py-2 text-sm font-medium text-brand-ink hover:bg-brand-500/10 disabled:opacity-50"
                      >
                        {downloadingId === downloadKey ? 'Preparing…' : '🎓 Certificate'}
                      </button>
                    )}
                    <Link
                      to={`/home/practice-tests/${p.testId}`}
                      className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-surface"
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
