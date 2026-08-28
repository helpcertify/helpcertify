import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { listAvailableQuizzes, listPracticeTestsBucketed } from '../api/studentContentApi';
import { cartApi } from '../api/cartApi';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { useExamCountdowns } from '../hooks/useExamCountdowns';
import { CourseCarousel, type CarouselItem } from '@/components/common/CourseCarousel';
import { toDate } from '@/utils/formatDate';
import {
  computeExamDatePlan,
  questionsPerDayFromMinutes,
  calendarDaysBetween,
  computeStudyStreak,
  buildDailyAnsweredMap,
  buildDailyCorrectMap,
  sumTrailingDays,
} from '../lib/studyPlan';
import type { StudyPlanDoc } from '@/types/models';

// A time-of-day greeting reads as personal without needing any extra data
// collection: `new Date()` in the browser already reflects the learner's own
// local clock, which is the same signal a stored timezone field would give.
function timeOfDayGreeting(hour: number): string {
  if (hour < 5) return 'Still up studying';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Good night';
}

// The personalized "what to do right now" dashboard — deliberately kept to
// just the greeting/Continue Practice, Today's Mission + stat row (both
// scoped to a single "primary" exam goal — see below), Continue where you
// left off, and Recommended for you. The fuller activity/progress picture
// (Your Study Plan per test, My Exams, Performance Summary, Recent
// Attempts) stays on My Profile (see ProfileActivitySections.tsx) — this
// page is "today's next action for your main goal," not a second full
// history/analytics view.
export function StudentHomePage() {
  const uid = useAuthStore((s) => s.firebaseUser?.uid);
  const profile = useAuthStore((s) => s.profile);
  const today = new Date();

  const { data: quizzes } = useQuery({ queryKey: ['student', 'availableQuizzes'], queryFn: listAvailableQuizzes });
  const { data: practiceBuckets } = useQuery({ queryKey: ['student', 'practiceTests'], queryFn: listPracticeTestsBucketed });
  const { data: purchases } = useQuery({ queryKey: ['student', 'purchases'], queryFn: cartApi.listMyPurchases });
  const { data: examCountdowns } = useExamCountdowns();

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
          bestStreak: (data.bestStreak as number) ?? 0,
        };
      });
    },
    enabled: !!uid,
  });

  // Every study plan the learner has, one per practice test — same query
  // (and cache key) ProfileActivitySections already populates, reused here
  // rather than re-fetched.
  const { data: studyPlans } = useQuery({
    queryKey: ['student', 'studyPlans', uid],
    queryFn: async () => {
      const snap = await getDocs(query(collection(db, 'studyPlans'), where('userId', '==', uid)));
      return snap.docs.map((d) => d.data() as StudyPlanDoc);
    },
    enabled: !!uid,
  });

  const purchasedSet = new Set((purchases?.purchases ?? []).map((p) => `${p.itemType}_${p.itemId}`));
  const quizById = new Map((quizzes ?? []).map((q) => [q.id, q]));
  const practiceTestById = new Map((practiceBuckets?.available ?? []).map((t) => [t.id, t]));
  const attemptByQuizId = new Map((myAttempts ?? []).map((a) => [a.quizId, a]));
  // All three buckets, not just "available" — a plan set on a test whose
  // window has since lapsed should still resolve to real data instead of
  // silently disappearing from this "primary goal" pick.
  const anyTestById = new Map(
    [...(practiceBuckets?.available ?? []), ...(practiceBuckets?.upcoming ?? []), ...(practiceBuckets?.expired ?? [])].map((t) => [
      t.id,
      t,
    ])
  );

  // The "primary" exam goal driving Today's Mission/the stat row/This
  // Week's Progress below — a single focus, matching the single "CISA
  // Exam" badge next to the greeting, not one strip per test (that's what
  // My Profile's "Your Learning Journey" is for). Prefers whichever
  // committed exam date is soonest; falls back to any other active plan
  // (pace-mode) if there's no exam-date plan at all.
  const plansWithTest = (studyPlans ?? []).filter((p) => anyTestById.has(p.testId));
  const examDatePlans = plansWithTest
    .filter((p) => p.planningMode === 'examDate' && p.targetExamDate)
    .map((p) => ({ plan: p, daysToExam: calendarDaysBetween(today, toDate(p.targetExamDate)) }))
    .filter((p) => p.daysToExam >= 0)
    .sort((a, b) => a.daysToExam - b.daysToExam);
  const primaryPlan = examDatePlans[0]?.plan ?? plansWithTest[0] ?? null;
  const primaryTest = primaryPlan ? (anyTestById.get(primaryPlan.testId) ?? null) : null;

  const primaryProgress = primaryTest ? (practiceProgressDocs ?? []).find((p) => p.testId === primaryTest.id) : undefined;
  const uniqueAnsweredCount = primaryProgress?.answeredQuestionIds.length ?? 0;

  // Non-reattempt sessions for just the primary test — same convention as
  // StudyPlanSection's own streak query (a reattempt re-answers already-
  // completed questions, so it isn't "new questions today/this week").
  const { data: primarySessions } = useQuery({
    queryKey: ['student', 'homeDashboardSessions', uid, primaryTest?.id],
    queryFn: async () => {
      const snap = await getDocs(
        query(
          collection(db, 'practiceSessions'),
          where('userId', '==', uid),
          where('testId', '==', primaryTest!.id),
          where('isReattempt', '==', false)
        )
      );
      return snap.docs.map((d) => {
        const data = d.data();
        return {
          startedAt: toDate(data.startedAt),
          answeredCount: (data.answeredCount as number) ?? 0,
          correctCount: (data.correctCount as number) ?? 0,
        };
      });
    },
    enabled: !!uid && !!primaryTest,
  });

  const minutesPerQuestion = primaryTest?.defaultMinutesPerQuestion ?? 1.8;
  let dailyTarget = 0;
  if (primaryPlan && primaryTest) {
    if (primaryPlan.planningMode === 'examDate' && primaryPlan.targetExamDate) {
      dailyTarget = computeExamDatePlan({
        today,
        targetExamDate: toDate(primaryPlan.targetExamDate),
        totalQuestions: primaryTest.totalQuestions,
        uniqueAnsweredCount,
        studyDays: primaryPlan.studyDays,
        revisionBufferDays: primaryPlan.revisionBufferDays,
        minutesPerQuestion,
      }).dailyTarget;
    } else {
      dailyTarget =
        primaryPlan.paceQuestionsPerDay ?? questionsPerDayFromMinutes(primaryPlan.paceMinutesPerDay ?? 0, minutesPerQuestion);
    }
  }

  const dailyAnsweredMap = buildDailyAnsweredMap(primarySessions ?? []);
  const dailyCorrectMap = buildDailyCorrectMap(primarySessions ?? []);
  const todayAnswered = sumTrailingDays(dailyAnsweredMap, today, 1);
  const thisWeekAnswered = sumTrailingDays(dailyAnsweredMap, today, 7);
  const thisWeekCorrect = sumTrailingDays(dailyCorrectMap, today, 7);
  const lastWeekAnswered = sumTrailingDays(dailyAnsweredMap, today, 7, 7);
  const lastWeekCorrect = sumTrailingDays(dailyCorrectMap, today, 7, 7);
  const weeklyAccuracy = thisWeekAnswered > 0 ? Math.round((thisWeekCorrect / thisWeekAnswered) * 100) : null;
  const lastWeekAccuracy = lastWeekAnswered > 0 ? Math.round((lastWeekCorrect / lastWeekAnswered) * 100) : null;
  const accuracyDelta = weeklyAccuracy !== null && lastWeekAccuracy !== null ? weeklyAccuracy - lastWeekAccuracy : null;
  // Week-over-week change in volume, not accuracy — null (no comparison
  // shown) rather than a misleading "+100%" when last week had no activity
  // to compare against at all.
  const weeklyQuestionsDelta = lastWeekAnswered > 0 ? Math.round(((thisWeekAnswered - lastWeekAnswered) / lastWeekAnswered) * 100) : null;
  // A weekly goal derived from the same daily target already driving
  // Today's Mission above, not a separately invented number.
  const weeklyGoal = dailyTarget * 7;
  const weeklyGoalPercent = weeklyGoal > 0 ? Math.min(100, Math.round((thisWeekAnswered / weeklyGoal) * 100)) : 0;
  const studyStreak = primaryPlan ? computeStudyStreak({ today, studyDays: primaryPlan.studyDays, dailyTarget, dailyAnsweredMap }) : 0;
  const nearestExam = examCountdowns?.[0] ?? null;

  // Recommended for you — ranked by rating (falls back to catalog order
  // when nothing has a rating yet), capped to 10 on request. Pulls from both
  // quizzes (Mock Exams) and practice tests: an earlier version only looked
  // at quizzes, which silently hid this whole section for a learner whose
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
      totalQuestions: q.totalQuestions ?? 0,
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
      totalQuestions: t.totalQuestions ?? 0,
    })),
  ]
    .sort((a, b) => (b.ratingAvg ?? 0) * (b.ratingCount ?? 0) - (a.ratingAvg ?? 0) * (a.ratingCount ?? 0))
    .slice(0, 10);

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

  // Upcoming Mock Exams — owned quizzes not yet attempted at all.
  const upcomingMockExams = (quizzes ?? [])
    .filter((q) => ((q.price ?? 0) === 0 || purchasedSet.has(`quiz_${q.id}`)) && !attemptByQuizId.get(q.id))
    .slice(0, 4);

  const hasMissionData = !!(primaryPlan && primaryTest && dailyTarget > 0);
  const todayPercent = hasMissionData ? Math.min(100, Math.round((todayAnswered / dailyTarget) * 100)) : 0;
  const questionsRemainingToday = hasMissionData ? Math.max(0, dailyTarget - todayAnswered) : 0;

  return (
    <div>
      {/* Welcome, primary action, and (when there's a committed exam date)
          a small countdown badge — the same nearest-exam data the sidebar's
          "Your Exams" cards use, just the single soonest one here. */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 text-2xl font-bold text-ink">
            {timeOfDayGreeting(new Date().getHours())}
            {profile?.name ? `, ${profile.name.split(' ')[0]}` : ''}! 👋
          </h1>
          <p className="text-sm text-ink-faint">Every question you practice today brings you one step closer to success.</p>
        </div>
        {nearestExam && (
          <div className="flex items-center gap-2.5 rounded-lg border border-surface-border bg-surface-raised px-3 py-2">
            <span className="text-lg" aria-hidden="true">
              📅
            </span>
            <div>
              <div className="text-xs text-ink-faint">{nearestExam.examName} Exam</div>
              <div className="text-xs font-bold uppercase tracking-wide text-[#D87F1D]">
                {nearestExam.daysToExam === 0 ? 'Exam is today' : `${nearestExam.daysToExam} Days to Go`}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Today's Mission — today's progress toward the primary goal's daily
          target, distinct from "Continue where you left off" below (which
          tracks whatever's actually in progress, possibly a different
          test). Only shown once there's a real plan with a real target to
          measure against. */}
      {hasMissionData && (
        <div className="mb-6 flex flex-col gap-4 rounded-xl border border-[#BFDBFE] bg-gradient-to-br from-[#EFF6FF] to-[#F8FAFF] p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div
              className="hidden h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white text-3xl shadow-sm sm:flex"
              aria-hidden="true"
            >
              🎯
            </div>
            <div>
              <div className="mb-1 text-xs font-bold uppercase tracking-wide text-[#155EEF]">Today's Mission</div>
              <div className="text-2xl font-bold text-[#0F172A]">
                {Math.min(todayAnswered, dailyTarget)} of {dailyTarget} Questions
              </div>
              <div className="mt-2 flex items-center gap-3">
                <div className="h-2 w-40 overflow-hidden rounded-full bg-white sm:w-56">
                  <div className="h-full rounded-full bg-[#155EEF]" style={{ width: `${todayPercent}%` }} />
                </div>
                <span className="text-sm font-semibold text-[#155EEF]">{todayPercent}%</span>
              </div>
              <p className="mt-2 text-xs text-[#64748B]">
                {questionsRemainingToday === 0
                  ? "Today's goal is complete. Nice work!"
                  : `You're doing great! Just ${questionsRemainingToday} more question${questionsRemainingToday === 1 ? '' : 's'} to complete today's goal.`}
              </p>
            </div>
          </div>
          <Link
            to={`/home/practice-tests/${primaryTest!.id}`}
            className="shrink-0 rounded-lg bg-[#155EEF] px-5 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-[#004EEB]"
          >
            Start Practicing →
          </Link>
        </div>
      )}

      {/* Stat row (Practiced/Accuracy/Study Streak/Today's Target) beside
          This Week's Progress — same primary-goal scope as Today's Mission
          above, so all these numbers describe the one focus test, not a
          cross-test aggregate. */}
      {hasMissionData && (
        <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px] lg:items-start">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard
              icon="📚"
              value={`${uniqueAnsweredCount} / ${primaryTest!.totalQuestions}`}
              valueColor="#0F172A"
              label="Practiced"
              sub={`${Math.max(0, primaryTest!.totalQuestions - uniqueAnsweredCount)} questions remaining`}
            />
            <StatCard
              icon="📈"
              value={weeklyAccuracy !== null ? `${weeklyAccuracy}%` : '—'}
              valueColor="#16A34A"
              label="Accuracy"
              sub={
                accuracyDelta === null
                  ? 'This week'
                  : accuracyDelta >= 0
                    ? `↑ ${accuracyDelta}% this week`
                    : `↓ ${Math.abs(accuracyDelta)}% this week`
              }
              subColor={accuracyDelta !== null && accuracyDelta < 0 ? '#DC2626' : '#16A34A'}
            />
            <StatCard
              icon="🔥"
              value={`${studyStreak} Day${studyStreak === 1 ? '' : 's'}`}
              valueColor="#D87F1D"
              label="Study Streak"
              sub={studyStreak > 0 ? 'Keep it going!' : 'Start today'}
            />
            <StatCard icon="🎯" value={String(dailyTarget)} valueColor="#7C3AED" label="Today's Target" sub="Daily goal" />
          </div>

          <Link
            to="/home/profile"
            className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-[0_2px_8px_rgba(15,23,42,0.04)] transition-colors hover:border-[#B9CEFF] dark:bg-surface-raised"
          >
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[#EFF6FF] text-xl" aria-hidden="true">
              📊
            </div>
            <div className="text-[26px] font-bold leading-tight text-[#155EEF]">{thisWeekAnswered}</div>
            <div className="text-sm font-semibold text-[#0F172A]">Questions This Week</div>
            {weeklyQuestionsDelta !== null && (
              <div className={`mt-1 text-xs font-semibold ${weeklyQuestionsDelta >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
                {weeklyQuestionsDelta >= 0 ? '↑' : '↓'} {Math.abs(weeklyQuestionsDelta)}% vs last week
              </div>
            )}
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#F1F5F9]">
              <div className="h-full rounded-full bg-[#155EEF]" style={{ width: `${weeklyGoalPercent}%` }} />
            </div>
          </Link>
        </div>
      )}

      {/* Continue where you left off — only shown while something is
          actually in progress (continueItem is null otherwise), so this
          heading never appears for a learner who hasn't started anything
          yet. HelpCertify Electric Blue theme: soft blue gradient instead of
          the app's general brand-blue tint, matching the Recommended for
          You cards' own header gradient. */}
      {continueItem && (
        <div className="mb-8 rounded-xl border border-[#B9CEFF] bg-gradient-to-r from-[#EFF6FF] to-[#F8FAFF] p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-[#64748B]">Continue where you left off</h2>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-[#0F172A]">{continueItem.title}</div>
              <div className="text-xs text-[#64748B]">{continueItem.category}</div>
              <div className="mt-1 text-sm text-[#334155]">
                {Math.round((continueItem.answeredCount / (continueItem.totalQuestions || 1)) * 100)}% complete ·{' '}
                {continueItem.answeredCount}/{continueItem.totalQuestions} questions
              </div>
            </div>
            <Link
              to={continueItem.href}
              className="rounded-lg bg-[#155EEF] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#004EEB]"
            >
              Continue →
            </Link>
          </div>
        </div>
      )}

      {/* Recommended for you — moved directly below "Continue where you
          left off" on request. */}
      <CourseCarousel title="Recommended for you" items={recommended} />

      {/* Upcoming or incomplete Mock Exams */}
      {upcomingMockExams.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-lg font-bold text-ink">Upcoming Mock Exams</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {upcomingMockExams.map((q) => (
              <div key={q.id} className="flex h-full flex-col rounded-xl border border-surface-border border-t-4 border-t-blue-400 bg-surface-raised p-4">
                <div className="mb-1 line-clamp-2 font-semibold text-ink">{q.title}</div>
                <div className="mb-3 space-y-0.5 text-xs text-ink-faint">
                  <div>{q.totalQuestions} questions · {q.durationMinutes} min</div>
                  <div>Passing score: {q.passMarkPercent ?? 60}%</div>
                  <div>Attempts remaining: 1</div>
                </div>
                <Link
                  to={`/quizzes/${q.id}/take`}
                  className="mt-auto block rounded-lg bg-[#155EEF] py-1.5 text-center text-sm font-medium text-surface"
                >
                  Start Mock Exam
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  value,
  valueColor,
  label,
  sub,
  subColor,
}: {
  icon: string;
  value: string;
  valueColor: string;
  label: string;
  sub: string;
  subColor?: string;
}) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-[0_2px_8px_rgba(15,23,42,0.04)] dark:bg-surface-raised">
      <div className="mb-1 text-xl" aria-hidden="true">
        {icon}
      </div>
      <div className="text-lg font-bold" style={{ color: valueColor }}>
        {value}
      </div>
      <div className="text-xs text-[#64748B]">{label}</div>
      <div className="mt-1 text-[11px]" style={{ color: subColor ?? '#94A3B8' }}>
        {sub}
      </div>
    </div>
  );
}
