import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { listAvailableQuizzes, listPracticeTestsBucketed, getQuizById } from '../api/studentContentApi';
import { cartApi } from '../api/cartApi';
import { resultsApi } from '@/features/admin/api/resultsApi';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { toDate } from '@/utils/formatDate';
import { StudyPlanSection, type StudyPlanCardData } from './StudyPlanSection';
import type { StudyPlanDoc } from '@/types/models';

const SUBMITTED_STATUSES = ['submitted', 'auto_submitted'];

// Everything that used to sit on the Home dashboard below "Continue where
// you left off" (Your Study Plan, My Exams, Performance Summary,
// Recommended Next Step, Recent Attempts) — moved onto My Profile on
// request, so Home stays focused on "what to do right now" (greeting,
// Continue Practice, Recommended for you, Upcoming Mock Exams) while this
// page holds the fuller activity/progress picture. Self-sufficient (its
// own queries, same pattern as CourseCarousel) rather than taking props
// from StudentHomePage, so it works regardless of which page renders it.
export function ProfileActivitySections() {
  const uid = useAuthStore((s) => s.firebaseUser?.uid);

  const { data: quizzes } = useQuery({ queryKey: ['student', 'availableQuizzes'], queryFn: listAvailableQuizzes });
  const { data: practiceBuckets } = useQuery({ queryKey: ['student', 'practiceTests'], queryFn: listPracticeTestsBucketed });
  const { data: purchases } = useQuery({ queryKey: ['student', 'purchases'], queryFn: cartApi.listMyPurchases });

  const { data: myAttempts } = useQuery({
    queryKey: ['student', 'myQuizAttemptsFull', uid],
    queryFn: async () => {
      const snap = await getDocs(query(collection(db, 'quizAttempts'), where('userId', '==', uid)));
      return snap.docs.map((d) => {
        const data = d.data();
        return {
          quizId: data.quizId as string,
          status: data.status as string,
          answeredCount: (data.answeredCount as number) ?? 0,
          totalQuestions: (data.totalQuestions as number) ?? 0,
        };
      });
    },
    enabled: !!uid,
  });

  const { data: practiceProgressDocs } = useQuery({
    queryKey: ['student', 'practiceProgressFull', uid],
    queryFn: async () => {
      const snap = await getDocs(query(collection(db, 'practiceProgress'), where('userId', '==', uid)));
      return snap.docs.map((d) => {
        const data = d.data();
        return { testId: data.testId as string, answeredQuestionIds: (data.answeredQuestionIds as string[]) ?? [] };
      });
    },
    enabled: !!uid,
  });

  const { data: studyPlans } = useQuery({
    queryKey: ['student', 'studyPlans', uid],
    queryFn: async () => {
      const snap = await getDocs(query(collection(db, 'studyPlans'), where('userId', '==', uid)));
      return snap.docs.map((d) => d.data() as StudyPlanDoc);
    },
    enabled: !!uid,
  });

  const { data: resultsData } = useQuery({ queryKey: ['student', 'pastQuizzes'], queryFn: resultsApi.listResultsForStudent });
  const attempts = (resultsData?.attempts ?? []).filter((a) => SUBMITTED_STATUSES.includes(a.status));

  // Each attempt's own quiz for its passMarkPercent (not stored on the
  // attempt itself) — same batched-fetch pattern as PastQuizzesPage.
  const quizIds = [...new Set(attempts.map((a) => a.quizId))];
  const { data: quizzesById } = useQuery({
    queryKey: ['student', 'quizzesForHistory', quizIds],
    queryFn: async () => {
      const results = await Promise.all(quizIds.map((id) => getQuizById(id)));
      return new Map(results.filter((q): q is NonNullable<typeof q> => !!q).map((q) => [q.id, q]));
    },
    enabled: quizIds.length > 0,
  });

  const purchasedSet = new Set((purchases?.purchases ?? []).map((p) => `${p.itemType}_${p.itemId}`));
  const practiceTestById = new Map((practiceBuckets?.available ?? []).map((t) => [t.id, t]));
  const attemptByQuizId = new Map((myAttempts ?? []).map((a) => [a.quizId, a]));

  // Your Study Plan — one card per practice test with an active plan, built
  // entirely from data already fetched above (studyPlans + the test's own
  // record + this learner's unique-answered progress). See StudyPlanSection
  // for the actual calculations and rendering.
  const studyPlanCards: StudyPlanCardData[] = (studyPlans ?? [])
    .map((plan): StudyPlanCardData | null => {
      const test = practiceTestById.get(plan.testId);
      if (!test) return null;
      const uniqueAnsweredCount = (practiceProgressDocs ?? []).find((p) => p.testId === plan.testId)?.answeredQuestionIds.length ?? 0;
      return {
        testId: plan.testId,
        testTitle: test.title,
        testCategory: test.category ?? 'Other',
        totalQuestions: test.totalQuestions,
        minutesPerQuestion: test.defaultMinutesPerQuestion ?? 1.8,
        uniqueAnsweredCount,
        plan,
      };
    })
    .filter((c): c is StudyPlanCardData => c !== null);

  // A single nudge (not one per test) toward the goal-setup flow for a
  // learner who owns a practice test but hasn't set any plan at all yet.
  const plannedTestIds = new Set(studyPlanCards.map((c) => c.testId));
  const unplannedTest = (practiceBuckets?.available ?? []).find(
    (t) =>
      t.studyPlannerEnabled !== false &&
      !plannedTestIds.has(t.id) &&
      ((t.price ?? 0) === 0 || purchasedSet.has(`practiceTest_${t.id}`))
  );

  // My Exams — everything owned (free or purchased), as compact cards.
  interface OwnedItem {
    id: string;
    title: string;
    expiryLabel: string;
    progressLabel: string;
    detailHref: string;
    actionHref: string;
    actionLabel: string;
  }
  const ownedItems: OwnedItem[] = [];
  for (const q of quizzes ?? []) {
    if (!((q.price ?? 0) === 0 || purchasedSet.has(`quiz_${q.id}`))) continue;
    const attempt = attemptByQuizId.get(q.id);
    ownedItems.push({
      id: q.id,
      title: q.title,
      expiryLabel: 'No expiry',
      progressLabel: attempt ? `${attempt.answeredCount}/${attempt.totalQuestions || q.totalQuestions} answered` : 'Not started',
      detailHref: `/home/quizzes/${q.id}`,
      actionHref: `/quizzes/${q.id}/take`,
      actionLabel: attempt?.status === 'in_progress' ? 'Resume' : attempt ? 'Review' : 'Start Practice',
    });
  }
  for (const t of practiceBuckets?.available ?? []) {
    if (!((t.price ?? 0) === 0 || purchasedSet.has(`practiceTest_${t.id}`))) continue;
    const progress = (practiceProgressDocs ?? []).find((p) => p.testId === t.id);
    const answered = progress?.answeredQuestionIds.length ?? 0;
    ownedItems.push({
      id: t.id,
      title: t.title,
      expiryLabel: toDate(t.availableUntil).toLocaleDateString(),
      progressLabel: `${answered}/${t.totalQuestions} answered`,
      detailHref: `/home/practice-tests/${t.id}`,
      actionHref: `/practice-tests/${t.id}/take`,
      actionLabel: answered > 0 ? 'Resume' : 'Start Practice',
    });
  }

  // Performance summary — scoped to quiz (Mock Exam) attempts only; a
  // practice-test's batched/resumable sessions have no single pass/fail
  // score the way a timed quiz attempt does, so there's nothing comparable
  // to fold in here.
  const scorePercents = attempts.map((a) => (a.totalQuestions > 0 ? (a.correctCount / a.totalQuestions) * 100 : 0));
  const averageScore = scorePercents.length > 0 ? Math.round(scorePercents.reduce((s, x) => s + x, 0) / scorePercents.length) : null;
  const bestScore = scorePercents.length > 0 ? Math.round(Math.max(...scorePercents)) : null;

  // Recommended next step — the lowest-scoring recent attempt, suggesting
  // more practice in that same category (not a specific "topic" — questions
  // have no topic/domain tag in this data model at all, so a real per-topic
  // weakness analysis isn't buildable without adding that tagging system
  // first).
  const weakest = [...attempts].sort((a, b) => {
    const pa = a.totalQuestions > 0 ? a.correctCount / a.totalQuestions : 0;
    const pb = b.totalQuestions > 0 ? b.correctCount / b.totalQuestions : 0;
    return pa - pb;
  })[0];
  const weakestQuiz = weakest ? quizzesById?.get(weakest.quizId) : null;
  const weakestPercent = weakest && weakest.totalQuestions > 0 ? Math.round((weakest.correctCount / weakest.totalQuestions) * 100) : null;

  // Encouraging framing instead of dwelling on the low score itself — the
  // number is still shown, but the headline reads as a nudge forward rather
  // than a callout of failure. Picked by score band, not randomized, so the
  // tone actually tracks how the learner is doing.
  const nextStepMessage =
    weakestPercent === null
      ? ''
      : weakestPercent >= 75
        ? `Great work so far! A bit more practice on ${weakest.quizTitle} ${weakestQuiz ? `(${weakestQuiz.category}) ` : ''}will get you even sharper.`
        : weakestPercent >= 50
          ? `You're making solid progress. Spend a little more time on ${weakest.quizTitle}${weakestQuiz ? ` (${weakestQuiz.category})` : ''} and that score will climb fast.`
          : `Every expert started somewhere. Revisit ${weakest.quizTitle}${weakestQuiz ? ` (${weakestQuiz.category})` : ''} and you'll see quick improvement with focused practice.`;

  const recentAttempts = [...attempts]
    .sort((a, b) => toDate(b.submittedAt).getTime() - toDate(a.submittedAt).getTime())
    .slice(0, 5);

  return (
    <div className="mt-8">
      <StudyPlanSection cards={studyPlanCards} unplannedTest={unplannedTest ? { id: unplannedTest.id, title: unplannedTest.title } : null} />

      {/* My Exams */}
      {ownedItems.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-lg font-bold text-ink">My Exams</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ownedItems.slice(0, 6).map((item) => (
              <div
                key={item.detailHref}
                className="flex h-full flex-col rounded-xl border border-surface-border border-t-4 border-t-violet-400 bg-surface-raised p-4"
              >
                <Link to={item.detailHref} className="hover:text-brand-ink">
                  <div className="mb-1 line-clamp-2 font-semibold text-ink">{item.title}</div>
                </Link>
                <div className="mb-1 text-xs text-ink-faint">Access: {item.expiryLabel}</div>
                <div className="mb-3 text-xs text-ink-faint">{item.progressLabel}</div>
                <Link
                  to={item.actionHref}
                  className="mt-auto block rounded-lg bg-[#1D4ED8] py-1.5 text-center text-sm font-medium text-surface"
                >
                  {item.actionLabel}
                </Link>
              </div>
            ))}
          </div>
          {ownedItems.length > 6 && (
            <Link to="/home/purchases" className="mt-3 inline-block text-sm font-medium text-brand-ink">
              View all in My Purchases →
            </Link>
          )}
        </div>
      )}

      {/* Performance summary */}
      {attempts.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-lg font-bold text-ink">Performance Summary</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard label="Tests attempted" value={String(attempts.length)} color="text-blue-700 dark:text-blue-400" />
            <StatCard
              label="Average score"
              value={averageScore !== null ? `${averageScore}%` : 'N/A'}
              color="text-violet-700 dark:text-violet-400"
            />
            <StatCard label="Best score" value={bestScore !== null ? `${bestScore}%` : 'N/A'} color="text-emerald-700 dark:text-emerald-400" />
          </div>
        </div>
      )}

      {/* Recommended next step */}
      {weakest && weakestPercent !== null && (
        <div className="mb-8 rounded-xl border border-brand-400/40 bg-brand-500/10 p-5">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-faint">Recommended Next Step</h2>
          <p className="mb-3 text-sm text-ink">{nextStepMessage}</p>
          <Link
            to="/home/practice-tests"
            className="inline-block rounded-lg bg-[#d87f1d] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Keep Practicing
          </Link>
        </div>
      )}

      {/* Recent attempts */}
      {recentAttempts.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-lg font-bold text-ink">Recent Attempts</h2>
          <div className="overflow-x-auto rounded-xl border border-surface-border bg-surface-raised">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-surface-border text-xs uppercase tracking-wide text-ink-faint">
                  <th className="px-4 py-3">Exam</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Result</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {recentAttempts.map((a) => {
                  const passMark = quizzesById?.get(a.quizId)?.passMarkPercent ?? 60;
                  const scorePercent = a.totalQuestions > 0 ? Math.round((a.correctCount / a.totalQuestions) * 100) : 0;
                  const passed = scorePercent >= passMark;
                  return (
                    <tr key={a.id}>
                      <td className="px-4 py-3 text-ink">{a.quizTitle}</td>
                      <td className="px-4 py-3 text-ink-faint">{toDate(a.submittedAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-ink">{scorePercent}%</td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            passed
                              ? 'rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-400'
                              : 'rounded-full bg-[#d87f1d]/15 px-2 py-0.5 text-xs text-[#d87f1d]'
                          }
                        >
                          {passed ? 'Passed' : 'Needs improvement'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Link to={`/home/past-quizzes/${a.quizId}`} className="font-medium text-[#1D4ED8] hover:underline">
                          Review
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-raised p-4">
      <div className="text-xs uppercase tracking-wide text-ink-faint">{label}</div>
      <div className={`mt-1 text-xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
