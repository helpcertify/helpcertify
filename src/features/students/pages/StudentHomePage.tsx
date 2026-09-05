import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { listAvailableQuizzes } from '../api/studentContentApi';
import { listAvailableCourses } from '../api/courseApi';
import { useMyQuizAttempts } from '../hooks/useMyQuizAttempts';
import { JumpBackIn } from '../components/JumpBackIn';
import { RecommendedCourses } from '../components/RecommendedCourses';
import { CourseRow, type CourseRowItem } from '@/components/common/CourseRow';
import { cartApi } from '../api/cartApi';
import { activePurchaseKeys } from '../lib/purchaseAccess';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { useExamCountdowns } from '../hooks/useExamCountdowns';
import { useCertificationCatalog } from '../api/certificationCatalogApi';
import { hasActivePackage } from '../lib/certificationCatalog';
import { CertificationCard, CertificationCardSkeleton } from '@/components/common/CertificationCard';
import { Avatar } from '@/components/common/Avatar';
import { WelcomeCouponBanner } from '../components/WelcomeCouponBanner';
import { buildDailyAnsweredMap, sumTrailingDays } from '../lib/studyPlan';
import { usePrimaryGoal } from '../lib/usePrimaryGoal';

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

// The personalized "what to do right now" dashboard - deliberately kept to
// just the greeting/Continue Practice, Today's Mission + stat row (both
// scoped to a single "primary" exam goal - see below), Continue where you
// left off, and Recommended for you. The fuller activity/progress picture
// (Your Study Plan per test, My Exams, Performance Summary, Recent
// Attempts) stays on My Profile (see ProfileActivitySections.tsx) - this
// page is "today's next action for your main goal," not a second full
// history/analytics view.
export function StudentHomePage() {
  const profile = useAuthStore((s) => s.profile);
  const today = new Date();

  const { data: quizzes } = useQuery({ queryKey: ['student', 'availableQuizzes'], queryFn: listAvailableQuizzes });
  const { data: allCourses } = useQuery({ queryKey: ['student', 'availableCourses'], queryFn: listAvailableCourses });
  const { data: purchases } = useQuery({ queryKey: ['student', 'purchases'], queryFn: cartApi.listMyPurchases });
  const { data: examCountdowns } = useExamCountdowns();
  const { data: catalog, isLoading: catalogLoading, error: catalogError, refetch: refetchCatalog } = useCertificationCatalog();

  const { data: myAttempts } = useMyQuizAttempts();

  // The learner's single primary study goal (per-test or whole-series) and
  // everything Today's Mission needs off it - see usePrimaryGoal.
  const { goal } = usePrimaryGoal();

  const purchasedSet = activePurchaseKeys(purchases?.purchases);
  const attemptByQuizId = new Map((myAttempts ?? []).map((a) => [a.quizId, a]));

  const dailyTarget = goal?.dailyTarget ?? 0;
  const dailyAnsweredMap = buildDailyAnsweredMap(goal?.sessions ?? []);
  const todayAnswered = sumTrailingDays(dailyAnsweredMap, today, 1);
  const nearestExam = examCountdowns?.[0] ?? null;

  // Real per-quiz attempt count (see QuizDoc.maxAttempts) - replaces what
  // used to be a hardcoded "Attempts remaining: 1" below.
  const attemptCountByQuizId = new Map<string, number>();
  for (const a of myAttempts ?? []) {
    attemptCountByQuizId.set(a.quizId, (attemptCountByQuizId.get(a.quizId) ?? 0) + 1);
  }

  // Upcoming Mock Exams - owned quizzes not yet attempted at all.
  const upcomingMockExams = (quizzes ?? [])
    .filter(
      (q) =>
        (purchasedSet.has(`quiz_${q.id}`) || ((q.price ?? 0) === 0 && !q.requiresEntitlement)) &&
        !attemptByQuizId.get(q.id),
    )
    .slice(0, 4);

  // "New courses" - the most recently created published courses, newest
  // first. createdAt predates some course docs, so fall back to 0.
  const newCourses: CourseRowItem[] = [...(allCourses ?? [])]
    .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
    .slice(0, 10)
    .map((c) => ({
      id: c.id,
      title: c.title,
      category: c.category,
      skillLevel: c.skillLevel,
      price: c.price,
      originalPrice: c.originalPrice,
      currency: c.currency,
      ratingAvg: c.ratingAvg,
      ratingCount: c.ratingCount,
      coverImageUrl: c.coverImageUrl,
    }));

  const hasMissionData = !!goal;
  const todayPercent = hasMissionData ? Math.min(100, Math.round((todayAnswered / dailyTarget) * 100)) : 0;
  const questionsRemainingToday = hasMissionData ? Math.max(0, dailyTarget - todayAnswered) : 0;

  return (
    <div>
      {/* Welcome, primary action, and (when there's a committed exam date)
          a small countdown badge - the same nearest-exam data the sidebar's
          "Your Exams" cards use, just the single soonest one here. */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Avatar name={profile?.name} avatarUrl={profile?.avatarUrl} size={56} />
          <div>
            <h1 className="mb-1 text-2xl font-bold text-ink">
              {timeOfDayGreeting(new Date().getHours())}
              {profile?.name ? `, ${profile.name.split(' ')[0]}` : ''}! 👋
            </h1>
            <p className="text-sm text-ink-faint">Every question you practice today brings you one step closer to success.</p>
          </div>
        </div>
        {nearestExam && (
          <div className="flex items-center gap-2.5 rounded-lg border border-surface-border bg-surface-raised px-3 py-2">
            <span className="text-lg" aria-hidden="true">
              📅
            </span>
            <div>
              <div className="text-xs text-ink-faint">{nearestExam.examName} Exam</div>
              <div className="text-xs font-bold uppercase tracking-wide text-warning">
                {nearestExam.daysToExam === 0 ? 'Exam is today' : `${nearestExam.daysToExam} Days to Go`}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Jump back in - the one place a returning learner continues an
          unfinished mock, practice session or course. Renders nothing when
          there's nothing in progress. */}
      <JumpBackIn />

      {/* Today's Mission - today's progress toward the primary goal's daily
          target, distinct from "Continue where you left off" below (which
          tracks whatever's actually in progress, possibly a different
          test). Only shown once there's a real plan with a real target to
          measure against. */}
      {hasMissionData && (
        <div className="mb-6 flex flex-col gap-4 rounded-xl border border-brand-500/30 bg-brand-50 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div
              className="hidden h-16 w-16 shrink-0 items-center justify-center rounded-full bg-surface-raised text-3xl shadow-sm sm:flex"
              aria-hidden="true"
            >
              🎯
            </div>
            <div>
              <div className="mb-1 text-xs font-bold uppercase tracking-wide text-brand-ink">Today's Mission</div>
              <div className="text-2xl font-bold text-ink">
                {Math.min(todayAnswered, dailyTarget)} of {dailyTarget} Questions
              </div>
              <div className="mt-2 flex items-center gap-3">
                <div className="h-2 w-40 overflow-hidden rounded-full bg-surface-raised sm:w-56">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${todayPercent}%` }} />
                </div>
                <span className="text-sm font-semibold text-brand-ink">{todayPercent}%</span>
              </div>
              <p className="mt-2 text-xs text-ink-faint">
                {questionsRemainingToday === 0
                  ? "Today's goal is complete. Nice work!"
                  : `You're doing great! Just ${questionsRemainingToday} more question${questionsRemainingToday === 1 ? '' : 's'} to complete today's goal.`}
              </p>
            </div>
          </div>
          <Link
            to={goal!.practiceHref}
            className="shrink-0 rounded-lg bg-brand-500 px-5 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-brand-600"
          >
            Start Practicing →
          </Link>
        </div>
      )}

      {/* Recommended courses - ranked from the categories the learner is
          already active in. Hidden when there's nothing to suggest. */}
      <RecommendedCourses />

      {/* Your certifications - catalog data filtered to certifications the
          learner already owns a package in, so "continue learning" sits
          above "browse and buy". */}
      {!catalogLoading &&
        !catalogError &&
        catalog &&
        catalog.certifications.filter(hasActivePackage).length > 0 && (
          <div className="mb-8">
            <h2 className="mb-4 text-lg font-bold text-ink">Your certifications</h2>
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
                  className="mt-auto block rounded-lg bg-brand-500 py-1.5 text-center text-sm font-medium text-surface"
                >
                  Start Mock Exam
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New courses - newest written-lesson courses, for discovery. */}
      {newCourses.length > 0 && <CourseRow title="New courses" items={newCourses} seeAllHref="/home/courses" />}

      {/* Choose Your Exam Preparation - the browse-and-buy grid, demoted
          below the fold now that "Jump back in" and recommendations lead
          the page. See api/cart.ts's getLearnerCatalog for how
          pricing/owned/in-cart state is resolved server-side. */}
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
            <button type="button" onClick={() => refetchCatalog()} className="font-semibold text-brand-ink hover:underline">
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

      {/* Refer & Earn - moved to the bottom of the page (still hides itself
          once the coupon is used), see WelcomeCouponBanner. */}
      <WelcomeCouponBanner className="mt-2" />
    </div>
  );
}
