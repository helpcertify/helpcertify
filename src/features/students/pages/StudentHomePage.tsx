import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { listAvailableQuizzes, listPracticeTestsBucketed } from '../api/studentContentApi';
import { cartApi } from '../api/cartApi';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { useExamCountdowns } from '../hooks/useExamCountdowns';
import { useCertificationCatalog } from '../api/certificationCatalogApi';
import { hasActivePackage } from '../lib/certificationCatalog';
import { CertificationCard, CertificationCardSkeleton } from '@/components/common/CertificationCard';
import { WelcomeCouponBanner } from '../components/WelcomeCouponBanner';
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
  const { data: catalog, isLoading: catalogLoading, error: catalogError, refetch: refetchCatalog } = useCertificationCatalog();

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
  const studyStreak = primaryPlan ? computeStudyStreak({ today, studyDays: primaryPlan.studyDays, dailyTarget, dailyAnsweredMap }) : 0;
  const nearestExam = examCountdowns?.[0] ?? null;

  // Real per-quiz attempt count (see QuizDoc.maxAttempts) — replaces what
  // used to be a hardcoded "Attempts remaining: 1" below.
  const attemptCountByQuizId = new Map<string, number>();
  for (const a of myAttempts ?? []) {
    attemptCountByQuizId.set(a.quizId, (attemptCountByQuizId.get(a.quizId) ?? 0) + 1);
  }

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

      {/* Refer & Earn — same banner (and same "hide it once it's used"
          logic) as My Profile's, see WelcomeCouponBanner. */}
      <WelcomeCouponBanner className="mb-6" />

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
        <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
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
            className="flex h-full flex-col rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-[0_2px_8px_rgba(15,23,42,0.04)] transition-colors hover:border-[#B9CEFF] dark:bg-surface-raised"
          >
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-wide text-[#64748B]">This Week's Progress</div>
              <span className="text-xs font-medium text-[#155EEF]">View Details →</span>
            </div>
            {weeklyQuestionsDelta !== null && (
              <div className={`mt-3 text-lg font-bold ${weeklyQuestionsDelta >= 0 ? 'text-[#16A34A]' : 'text-[#EA580C]'}`}>
                {weeklyQuestionsDelta >= 0 ? '↑' : '↓'} {Math.abs(weeklyQuestionsDelta)}%{' '}
                <span className="text-xs font-medium text-[#64748B]">vs last week</span>
              </div>
            )}
          </Link>
        </div>
      )}

      {/* Choose Your Exam Preparation — replaces the old "Recommended for
          you" flat item carousel. One card per certification, packages
          (Mock Exams/Practice Questions/Complete) grouped underneath it
          instead of showing up as separate, unrelated product cards. See
          api/cart.ts's getLearnerCatalog for how pricing/owned/in-cart
          state is resolved server-side. */}
      <div className="mb-8">
        <h2 className="mb-1 text-lg font-bold text-ink">Choose Your Exam Preparation</h2>
        <p className="mb-4 text-sm text-ink-faint">All prices are visible. Select the plan you want and purchase directly.</p>

        {catalogLoading && (
          <div className="space-y-4">
            <CertificationCardSkeleton />
            <CertificationCardSkeleton />
          </div>
        )}
        {!catalogLoading && catalogError && (
          <div className="rounded-lg border border-surface-border bg-surface-raised p-4 text-sm text-ink-faint">
            We couldn't load the available certification packages.{' '}
            <button type="button" onClick={() => refetchCatalog()} className="font-semibold text-[#155EEF] hover:underline">
              Retry
            </button>
          </div>
        )}
        {!catalogLoading && !catalogError && catalog && catalog.certifications.length === 0 && (
          <p className="text-sm text-ink-faint">No certification packages are available right now.</p>
        )}
        {!catalogLoading && !catalogError && catalog && catalog.certifications.length > 0 && (
          <div className="space-y-4">
            {catalog.certifications.map((cert) => (
              <CertificationCard key={cert.id} certification={cert} />
            ))}
          </div>
        )}
      </div>

      {/* My Active Certifications — the same catalog data, filtered to
          certifications where the learner already owns a package, so
          "continue learning" and "browse/buy" stay in visually distinct
          sections rather than mixed into one list. */}
      {!catalogLoading &&
        !catalogError &&
        catalog &&
        catalog.certifications.filter(hasActivePackage).length > 0 && (
          <div className="mb-8">
            <h2 className="mb-4 text-lg font-bold text-ink">My Active Certifications</h2>
            <div className="space-y-4">
              {catalog.certifications.filter(hasActivePackage).map((cert) => (
                <CertificationCard key={cert.id} certification={cert} />
              ))}
            </div>
          </div>
        )}

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
                  <div>Attempts remaining: {Math.max(0, (q.maxAttempts ?? 1) - (attemptCountByQuizId.get(q.id) ?? 0))}</div>
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
