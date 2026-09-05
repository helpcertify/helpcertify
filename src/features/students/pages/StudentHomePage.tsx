import { useQuery } from '@tanstack/react-query';
import { listAvailableCourses } from '../api/courseApi';
import { RecommendedCourses } from '../components/RecommendedCourses';
import { CourseRow, type CourseRowItem } from '@/components/common/CourseRow';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { useExamCountdowns } from '../hooks/useExamCountdowns';
import { useCertificationCatalog } from '../api/certificationCatalogApi';
import { hasActivePackage } from '../lib/certificationCatalog';
import { CertificationCard } from '@/components/common/CertificationCard';
import { CertificationPrepSection } from '../components/CertificationPrepSection';
import { Avatar } from '@/components/common/Avatar';
import { WelcomeCouponBanner } from '../components/WelcomeCouponBanner';

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

// The learner home page - focused on browsing and buying exam preparation.
// The learner's in-progress work ("Jump back in"), study goal and full
// activity/progress picture (Your Study Plan, My Exams, Performance
// Summary, Recent Attempts) all live on My Profile (see ProfilePage.tsx /
// ProfileActivitySections.tsx).
export function StudentHomePage() {
  const profile = useAuthStore((s) => s.profile);

  const { data: allCourses } = useQuery({ queryKey: ['student', 'availableCourses'], queryFn: listAvailableCourses });
  const { data: examCountdowns } = useExamCountdowns();
  const { data: catalog, isLoading: catalogLoading, error: catalogError } = useCertificationCatalog();

  const nearestExam = examCountdowns?.[0] ?? null;

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

      {/* Recommended courses ("Courses to explore") - ranked from the
          categories the learner is already active in. Compact row so it
          does not dominate the page. Hidden when there's nothing to suggest. */}
      <RecommendedCourses />

      {/* Prepare for Your Certification - the browse-and-buy grid, driven
          from the certification catalog (product data). See
          api/cart.ts's getLearnerCatalog for how pricing/owned/in-cart
          state is resolved server-side. */}
      <CertificationPrepSection />

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

      {/* New courses - newest written-lesson courses, for discovery. Compact
          row, kept near the bottom of the page. */}
      {newCourses.length > 0 && (
        <CourseRow title="New courses" items={newCourses} seeAllHref="/home/courses" compact />
      )}

      {/* Refer & Earn - moved to the bottom of the page (still hides itself
          once the coupon is used), see WelcomeCouponBanner. */}
      <WelcomeCouponBanner className="mt-2" />
    </div>
  );
}
