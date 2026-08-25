import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { listAvailableQuizzes, listPracticeTestsBucketed, getQuizById } from '../api/studentContentApi';
import { cartApi } from '../api/cartApi';
import { resultsApi } from '@/features/admin/api/resultsApi';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { toDate } from '@/utils/formatDate';
import { CourseCarousel, type CarouselItem } from '@/components/common/CourseCarousel';

const SUBMITTED_STATUSES = ['submitted', 'auto_submitted'];

// The personalized dashboard — replaced what used to be a bare quiz grid
// (that content moved to MockExamsPage). Every section here is built from
// data this app already has; one thing is deliberately simplified rather
// than faked: "Recommended next step" points at a category to practice more
// in, not a specific "weak topic" — questions have no topic/domain tag in
// this data model at all, so a real per-topic weakness analysis isn't
// buildable without adding that tagging system first.
export function StudentHomePage() {
  const uid = useAuthStore((s) => s.firebaseUser?.uid);
  const profile = useAuthStore((s) => s.profile);

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
          startedAt: data.startedAt as { toMillis?: () => number } | undefined,
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
        return {
          testId: data.testId as string,
          answeredQuestionIds: (data.answeredQuestionIds as string[]) ?? [],
          updatedAt: data.updatedAt as { toMillis?: () => number } | undefined,
        };
      });
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
  const quizById = new Map((quizzes ?? []).map((q) => [q.id, q]));
  const practiceTestById = new Map((practiceBuckets?.available ?? []).map((t) => [t.id, t]));
  const attemptByQuizId = new Map((myAttempts ?? []).map((a) => [a.quizId, a]));

  // Recommended for you — ranked by rating (falls back to catalog order
  // when nothing has a rating yet), capped to 5 on request. Pulls from both
  // quizzes (Mock Exams) and practice tests: an earlier version only looked
  // at quizzes, which silently hid this whole section for a student whose
  // platform mostly has published practice tests rather than quizzes (the
  // section renders nothing at all once its item list is empty, see
  // CourseCarousel). Not personalized in any real sense (no click/purchase
  // history feeds this), same honest "best of the catalog" signal used
  // everywhere else ratings show up.
  const recommended: CarouselItem[] = [
    ...(quizzes ?? []).map((q) => ({
      itemType: 'quiz' as const,
      id: q.id,
      title: q.title,
      category: q.category ?? 'Other',
      skillLevel: q.skillLevel ?? 'Foundation',
      price: q.price ?? 0,
      originalPrice: q.originalPrice ?? null,
      currency: q.currency ?? 'INR',
      ratingAvg: q.ratingAvg ?? 0,
      ratingCount: q.ratingCount ?? 0,
    })),
    ...(practiceBuckets?.available ?? []).map((t) => ({
      itemType: 'practiceTest' as const,
      id: t.id,
      title: t.title,
      category: t.category ?? 'Other',
      skillLevel: t.skillLevel ?? 'Foundation',
      price: t.price ?? 0,
      originalPrice: t.originalPrice ?? null,
      currency: t.currency ?? 'INR',
      ratingAvg: t.ratingAvg ?? 0,
      ratingCount: t.ratingCount ?? 0,
    })),
  ]
    .sort((a, b) => (b.ratingAvg ?? 0) * (b.ratingCount ?? 0) - (a.ratingAvg ?? 0) * (a.ratingCount ?? 0))
    .slice(0, 5);

  // Continue where you left off — the single most-recently-touched
  // in-progress item across both quizzes and practice tests.
  interface ContinueCandidate {
    title: string;
    category: string;
    answeredCount: number;
    totalQuestions: number;
    lastActivityMs: number;
    href: string;
  }
  const continueCandidates: ContinueCandidate[] = [];
  for (const a of myAttempts ?? []) {
    if (a.status !== 'in_progress') continue;
    const quiz = quizById.get(a.quizId);
    if (!quiz) continue;
    continueCandidates.push({
      title: quiz.title,
      category: quiz.category ?? 'Other',
      answeredCount: a.answeredCount,
      totalQuestions: a.totalQuestions || quiz.totalQuestions,
      lastActivityMs: a.startedAt?.toMillis?.() ?? 0,
      href: `/quizzes/${a.quizId}/take`,
    });
  }
  for (const p of practiceProgressDocs ?? []) {
    const test = practiceTestById.get(p.testId);
    if (!test) continue;
    const answered = p.answeredQuestionIds.length;
    if (answered === 0 || answered >= test.totalQuestions) continue;
    continueCandidates.push({
      title: test.title,
      category: test.category ?? 'Other',
      answeredCount: answered,
      totalQuestions: test.totalQuestions,
      lastActivityMs: p.updatedAt?.toMillis?.() ?? 0,
      href: `/practice-tests/${p.testId}/take`,
    });
  }
  continueCandidates.sort((a, b) => b.lastActivityMs - a.lastActivityMs);
  const continueItem = continueCandidates[0] ?? null;

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

  // Performance summary — scoped to quiz (Mock Exam) attempts only; see
  // this file's header comment for why practice-test time isn't included.
  const scorePercents = attempts.map((a) => (a.totalQuestions > 0 ? (a.correctCount / a.totalQuestions) * 100 : 0));
  const averageScore = scorePercents.length > 0 ? Math.round(scorePercents.reduce((s, x) => s + x, 0) / scorePercents.length) : null;
  const bestScore = scorePercents.length > 0 ? Math.round(Math.max(...scorePercents)) : null;

  // Recommended next step — the lowest-scoring recent attempt, suggesting
  // more practice in that same category (not a specific "topic", see the
  // header comment on why).
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

  // Upcoming Mock Exams — owned quizzes not yet attempted at all.
  const upcomingMockExams = (quizzes ?? [])
    .filter((q) => ((q.price ?? 0) === 0 || purchasedSet.has(`quiz_${q.id}`)) && !attemptByQuizId.get(q.id))
    .slice(0, 4);

  const recentAttempts = [...attempts]
    .sort((a, b) => toDate(b.submittedAt).getTime() - toDate(a.submittedAt).getTime())
    .slice(0, 5);

  return (
    <div>
      {/* Welcome and primary action */}
      <div className="mb-8">
        <h1 className="mb-1 text-2xl font-bold text-ink">
          Welcome back{profile?.name ? `, ${profile.name.split(' ')[0]}` : ''}.
        </h1>
        <p className="mb-4 text-sm text-ink-faint">
          {continueItem ? `Continue preparing for ${continueItem.title}.` : "Let's find what to prepare for next."}
        </p>
        {continueItem && (
          <Link
            to={continueItem.href}
            className="inline-block rounded-lg bg-[#1D4ED8] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            Continue Practice
          </Link>
        )}
      </div>

      {/* Continue where you left off — only shown while something is
          actually in progress (continueItem is null otherwise), so this
          heading never appears for a student who hasn't started anything
          yet. */}
      {continueItem && (
        <div className="mb-8 rounded-xl border border-brand-400 bg-brand-500/10 p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-faint">Continue where you left off</h2>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-ink">{continueItem.title}</div>
              <div className="text-xs text-ink-faint">{continueItem.category}</div>
              <div className="mt-1 text-sm text-ink-muted">
                {Math.round((continueItem.answeredCount / (continueItem.totalQuestions || 1)) * 100)}% complete ·{' '}
                {continueItem.answeredCount}/{continueItem.totalQuestions} questions
              </div>
            </div>
            <Link to={continueItem.href} className="rounded-lg bg-[#1D4ED8] px-4 py-2 text-sm font-medium text-surface">
              Continue →
            </Link>
          </div>
        </div>
      )}

      {/* My Exams */}
      {ownedItems.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-lg font-bold text-ink">My Exams</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ownedItems.slice(0, 6).map((item) => (
              <div key={item.detailHref} className="rounded-xl border border-surface-border border-t-4 border-t-violet-400 bg-surface-raised p-4">
                <Link to={item.detailHref} className="hover:text-brand-ink">
                  <div className="mb-1 line-clamp-2 font-semibold text-ink">{item.title}</div>
                </Link>
                <div className="mb-1 text-xs text-ink-faint">Access: {item.expiryLabel}</div>
                <div className="mb-3 text-xs text-ink-faint">{item.progressLabel}</div>
                <Link
                  to={item.actionHref}
                  className="block rounded-lg bg-[#1D4ED8] py-1.5 text-center text-sm font-medium text-surface"
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
            className="inline-block rounded-lg bg-[#F59E0B] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Keep Practicing
          </Link>
        </div>
      )}

      {/* Upcoming or incomplete Mock Exams */}
      {upcomingMockExams.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-lg font-bold text-ink">Upcoming Mock Exams</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {upcomingMockExams.map((q) => (
              <div key={q.id} className="rounded-xl border border-surface-border border-t-4 border-t-blue-400 bg-surface-raised p-4">
                <div className="mb-1 line-clamp-2 font-semibold text-ink">{q.title}</div>
                <div className="mb-3 space-y-0.5 text-xs text-ink-faint">
                  <div>{q.totalQuestions} questions · {q.durationMinutes} min</div>
                  <div>Passing score: {q.passMarkPercent ?? 60}%</div>
                  <div>Attempts remaining: 1</div>
                </div>
                <Link
                  to={`/quizzes/${q.id}/take`}
                  className="block rounded-lg bg-[#1D4ED8] py-1.5 text-center text-sm font-medium text-surface"
                >
                  Start Mock Exam
                </Link>
              </div>
            ))}
          </div>
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
                              : 'rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400'
                          }
                        >
                          {passed ? 'Passed' : 'Needs improvement'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Link to={`/home/past-quizzes/${a.quizId}`} className="font-medium text-[#F59E0B] hover:underline">
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

      <CourseCarousel title="Recommended for you" items={recommended} compactActions />
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
