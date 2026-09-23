import { useState } from 'react';
import { NavLink, Link, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { authApi } from '@/features/auth/api/authApi';
import { Logo } from '@/components/brand/Logo';
import { cartApi } from '@/features/students/api/cartApi';
import { CartIcon, HeartIcon, BellIcon } from '@/components/common/icons';
import { SearchBar } from '@/components/common/SearchBar';
import { aiCourseBuilderApi } from '@/features/catalogSubmissions/api/aiCourseBuilderApi';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { useUiStore } from '@/store/useUiStore';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { Avatar } from '@/components/common/Avatar';
import { useMyCreatorEntitlements } from '@/features/creator/hooks/useCreatorCommerce';

// "Exam Categories" used to be its own tab; its filtering moved inline onto
// the Practice Exams/Mock Exams pages themselves (see FilterBar) instead of
// sitting in the main nav. Billing & Orders (formerly "My Purchases") was
// briefly moved under My Profile, but moved back to its own tab on request
// so learners can reach their purchase history directly from the sidebar.
// The first tab (still routed to /home, the dashboard) is labeled "Learning
// Portal" rather than "Home" on request.
const NAV_ITEMS = [
  { to: '/home', label: 'Learning Portal', end: true },
  { to: '/home/practice-tests', label: 'Practice Exams' },
  { to: '/home/mock-exams', label: 'Mock Exams' },
  { to: '/home/courses', label: 'Courses' },
  { to: '/home/past-quizzes', label: 'My Attempts' },
  { to: '/home/certificates', label: 'My Certificates' },
  { to: '/home/purchases', label: 'Billing & Orders' },
  { to: '/home/wishlist', label: 'Saved Items' },
  { to: '/home/custom-exams', label: 'Custom Exam Builder' },
  { to: '/home/my-training', label: 'My Training' },
];

// My Profile and Settings are account-level, not content tabs, so they're
// pinned on after NAV_ITEMS instead of mixed into it: Settings last, My
// Profile directly above it. Both are real routes now (My Profile used to
// open a modal - moved to its own page/route on request), so both get the
// same active-state NavLink styling for free.

// Matches the reference screenshots' "Learning Portal" student shell: a
// unified top header (brand, search, account-utility icons) that spans the
// full width at every breakpoint, with the actual nav living in a left
// sidebar (lg: and up) or a dropdown just under the header (mobile) - the
// header itself never carries nav links. No department/academic-year badges
// here - this platform isn't limited to students at an institution, so
// profile fields stay generic (name, email, avatar) rather than
// campus-specific.
export function StudentShell() {
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const pushToast = useUiStore((s) => s.pushToast);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // staleTime keeps this from refetching on every focus/route-change - the
  // count only actually changes from an add/remove/checkout, and those
  // mutations already invalidate this same query key themselves.
  const { data: cart } = useQuery({ queryKey: ['student', 'cart'], queryFn: cartApi.getCart, staleTime: 30_000 });
  const cartCount = cart?.items.length ?? 0;

  // The AI course builder nav link appears only for accounts that actually
  // have the feature (admin / trainer / content partner by default, plus
  // any account an admin has extra-granted under Settings, Feature Access).
  const { data: aiCourseAccess } = useQuery({
    queryKey: ['aiCourseBuilder', 'myAccess'],
    queryFn: aiCourseBuilderApi.checkMyAccess,
    staleTime: 5 * 60_000,
  });

  // Once the Creator commercial model is switched on, a purchased Course
  // Creator plan (Manual or AI) also lights up the builder link - the
  // legacy feature-access flag above is no longer the only way in.
  const creatorEnt = useMyCreatorEntitlements();
  const showCourseBuilder =
    aiCourseAccess?.allowed ||
    (creatorEnt.commerceEnabled && (creatorEnt.hasCourseAi || creatorEnt.hasCourseManual));

  const handleSignOut = async () => {
    await authApi.logout();
    navigate('/login');
  };

  // There's no notifications backend/collection anywhere in this data
  // model, so this is an honest "nothing to show yet" affordance rather
  // than a fabricated unread badge.
  const handleNotificationsClick = () => pushToast("You're all caught up. No new notifications yet.", 'info');

  // text-ink (not text-ink-muted) for the inactive state - real user
  // feedback that nav tab labels needed to read as solidly dark, not a
  // secondary/muted gray, to stay clearly visible.
  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    clsx(
      'rounded-lg px-3 py-2 text-sm transition-colors',
      isActive ? 'bg-brand-50 font-semibold text-brand-ink' : 'text-ink hover:bg-surface-sunken',
    );

  const navLinks = (onNavigate: () => void) => (
    <>
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} onClick={onNavigate} className={navLinkClass}>
          {item.label}
        </NavLink>
      ))}
      {profile?.partnerId ? (
        <>
          <NavLink to="/home/partner" onClick={onNavigate} className={navLinkClass}>
            Partner Dashboard
          </NavLink>
          <NavLink to="/home/creator" onClick={onNavigate} className={navLinkClass}>
            Creator Workspace
          </NavLink>
        </>
      ) : (
        <NavLink to="/home/become-a-partner" onClick={onNavigate} className={navLinkClass}>
          Become a Partner
        </NavLink>
      )}
      {/* Always shown, not just once trainerId is set - a non-trainer sees
          a "Request Trainer Access" prompt on this page instead of a dead
          end (see TrainerWorkspacePage.tsx's RequestTrainerAccess). */}
      <NavLink to="/home/trainer" onClick={onNavigate} className={navLinkClass}>
        {profile?.trainerId ? 'Trainer Workspace' : 'Become a Trainer'}
      </NavLink>
      {showCourseBuilder && (
        <NavLink to="/home/creator/courses" onClick={onNavigate} className={navLinkClass}>
          {creatorEnt.commerceEnabled ? 'Course Builder' : 'AI Course Builder'}
        </NavLink>
      )}
      <NavLink to="/home/creator/plans" onClick={onNavigate} className={navLinkClass}>
        Creator Plans
      </NavLink>
      <NavLink to="/home/profile" onClick={onNavigate} className={navLinkClass}>
        My Profile
      </NavLink>
      <NavLink to="/home/settings" onClick={onNavigate} className={navLinkClass}>
        Settings
      </NavLink>
    </>
  );

  return (
    <div className="min-h-screen bg-surface">
      {/* Unified header - logo, search, Help, Saved Items, Cart (amber
          count), Notifications, avatar. Fixed height (h-14) so the sidebar
          below can offset its own sticky position by an exact amount. */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-surface-border bg-surface-raised px-4 lg:px-8">
        <button
          type="button"
          onClick={() => setMobileNavOpen((v) => !v)}
          aria-label="Toggle menu"
          className="shrink-0 rounded-lg border border-surface-border-strong px-2.5 py-1.5 text-base text-ink-muted lg:hidden"
        >
          {mobileNavOpen ? '✕' : '☰'}
        </button>
        <Logo size="sm" className="shrink-0" />

        <SearchBar to="/home/search" placeholder="Search certifications, exams and topics" className="hidden min-w-0 flex-1 sm:block [&>div]:mx-auto [&>div]:max-w-xl" />

        <div className="ml-auto flex shrink-0 items-center gap-4">
          <Link to="/home/help" className="hidden text-sm font-medium text-ink-muted hover:text-ink sm:inline">
            Help
          </Link>
          <Link to="/home/wishlist" aria-label="Saved items" className="text-ink-muted hover:text-ink">
            <HeartIcon filled={false} className="h-5 w-5" />
          </Link>
          {/* Encircled in blue on request, rather than a bare icon like the
              other header buttons. */}
          <Link
            to="/home/cart"
            aria-label="Cart"
            className="relative flex h-8 w-8 items-center justify-center rounded-full border-2 border-brand-500 text-brand-500 hover:bg-brand-500/10"
          >
            <CartIcon className="h-4 w-4" />
            {cartCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-warning text-[10px] font-semibold text-white ring-2 ring-surface-raised">
                {cartCount}
              </span>
            )}
          </Link>
          <button type="button" onClick={handleNotificationsClick} aria-label="Notifications" className="text-ink-muted hover:text-ink">
            <BellIcon className="h-5 w-5" />
          </button>
          <Link to="/home/profile" aria-label="My Profile">
            <Avatar name={profile?.name} avatarUrl={profile?.avatarUrl} size={32} />
          </Link>
        </div>
      </header>

      {/* Mobile nav dropdown - below lg: only, opened by the header's
          hamburger button. */}
      {mobileNavOpen && (
        <nav className="flex flex-col gap-1 border-b border-surface-border p-4 lg:hidden">
          {navLinks(() => setMobileNavOpen(false))}
          <ReferAndEarnCard className="mt-2" />
          <button
            type="button"
            onClick={handleSignOut}
            className="mt-2 rounded-lg border border-surface-border-strong py-2 text-sm font-medium text-ink-muted hover:border-danger hover:text-danger"
          >
            Sign Out
          </button>
        </nav>
      )}

      <div className="lg:flex">
        {/* Desktop sidebar - lg: and up only, offset below the fixed-height
            header (top-14 / h-[calc(100vh-3.5rem)] both match h-14 above).
            Nav-only now; the brand mark moved up into the header so it
            isn't shown twice. Sign Out stays pinned at the bottom via
            mt-auto, same as before. */}
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 flex-col border-r border-surface-border bg-surface-raised p-6 lg:flex">
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">{navLinks(() => {})}</nav>
          <div className="mt-auto shrink-0">
            <ReferAndEarnCard className="mb-3" />
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full rounded-lg border border-surface-border-strong py-2 text-sm font-medium text-ink-muted hover:border-danger hover:text-danger"
            >
              Sign Out
            </button>
          </div>
        </aside>

        <div className="flex min-h-[calc(100vh-3.5rem)] min-w-0 flex-1 flex-col">
          <main className="mx-auto w-full max-w-[1640px] flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8 xl:px-14">
            <ErrorBoundary title="This page hit an error">
              <Outlet />
            </ErrorBoundary>
          </main>
          <SiteFooter />
        </div>
      </div>
    </div>
  );
}

// Links to My Profile's own "Refer & Earn" section - that's where the
// actual referral link, copy button, and referral history live (see
// ReferAndEarnSection.tsx); this sidebar card is just a permanent
// reminder/entry point, same role the exam countdown cards play above it.
function ReferAndEarnCard({ className = '' }: { className?: string }) {
  return (
    <Link to="/home/profile" className={`block w-full rounded-lg border border-brand-500/30 bg-brand-50 p-3 text-left ${className}`}>
      <div className="flex items-center gap-2.5">
        <span className="text-xl" aria-hidden="true">
          🎁
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink">Refer & Earn</div>
          <div className="text-xs text-ink-faint">Invite friends and earn up to</div>
        </div>
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-base font-bold text-brand-ink">₹500</span>
        <span className="text-sm text-brand-ink">→</span>
      </div>
    </Link>
  );
}

