import { useEffect, useRef, useState } from 'react';
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
import { useReferralProgramSettings } from '@/features/students/hooks/useReferralProgramSettings';
import { formatMoney } from '@/utils/currency';

// Redesign (2026-09, blueprint Section 3 "Information architecture"): the
// primary learner nav is task-based - what a learner DOES - not a flat list
// of every route. Everything account/content-adjacent (certificates,
// billing, saved items, profile, settings, referral, the personal Custom
// Exam Builder, and the creator/trainer/partner workspaces) moved into the
// avatar menu below instead of sitting in this list, per the blueprint's own
// finding: "Learner rail has 16 mixed links ... with an inner scrollbar" ->
// "Replace with task-based learner navigation ... Move account items under
// avatar menu." Every one of those routes still exists unchanged - only
// where they're reached from moved.
//
// "Explore" maps to the course catalog (Section 2A: "Course catalog ...
// Explore Courses -> Course Detail -> My Learning -> Course reader"),
// distinct from Practice/Mock Exams, which are their own primary items since
// they're the platform's other core product line (Exam Prep), not a subset
// of "explore."
const NAV_ITEMS = [
  { to: '/home', label: 'Home', end: true },
  { to: '/home/my-learning', label: 'My Learning' },
  { to: '/home/courses', label: 'Explore' },
  { to: '/home/practice-tests', label: 'Practice' },
  { to: '/home/mock-exams', label: 'Mock Exams' },
  { to: '/home/past-quizzes', label: 'My Attempts' },
];

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
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

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

  // Close the account menu on an outside click or Escape - the only two ways
  // a native <select>/menu would also close.
  useEffect(() => {
    if (!accountMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) setAccountMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAccountMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [accountMenuOpen]);

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

  const primaryNavLinks = (onNavigate: () => void) => (
    <>
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} onClick={onNavigate} className={navLinkClass}>
          {item.label}
        </NavLink>
      ))}
    </>
  );

  return (
    <div className="min-h-screen bg-surface">
      {/* Unified header - logo, primary nav (lg:+), search, Help, Saved
          Items, Cart (amber count), Notifications, avatar menu. Fixed
          height (h-14) so the sidebar below can offset its own sticky
          position by an exact amount. */}
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

          <div className="relative" ref={accountMenuRef}>
            <button
              type="button"
              onClick={() => setAccountMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={accountMenuOpen}
              aria-label="Account menu"
              className="flex items-center gap-1 rounded-full"
            >
              <Avatar name={profile?.name} avatarUrl={profile?.avatarUrl} size={32} />
              <span aria-hidden="true" className="text-xs text-ink-faint">
                ▾
              </span>
            </button>
            {accountMenuOpen && (
              <AccountMenu
                profile={profile}
                showCourseBuilder={!!showCourseBuilder}
                creatorEnt={creatorEnt}
                onNavigate={() => setAccountMenuOpen(false)}
                onSignOut={handleSignOut}
              />
            )}
          </div>
        </div>
      </header>

      {/* Mobile nav dropdown - below lg: only, opened by the header's
          hamburger button. Primary task nav only; account items live in the
          avatar menu on every breakpoint, same as desktop. */}
      {mobileNavOpen && (
        <nav className="flex flex-col gap-1 border-b border-surface-border p-4 lg:hidden">
          {primaryNavLinks(() => setMobileNavOpen(false))}
          <ReferAndEarnCard className="mt-2" />
        </nav>
      )}

      <div className="lg:flex">
        {/* Desktop sidebar - lg: and up only, offset below the fixed-height
            header (top-14 / h-[calc(100vh-3.5rem)] both match h-14 above).
            Six task-based links only now (no overflow-y-auto needed - it
            never overflows the viewport at this length, which is itself the
            fix for the "inner scrollbar" the blueprint flagged). */}
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 flex-col border-r border-surface-border bg-surface-raised p-6 lg:flex">
          <nav className="flex flex-1 flex-col gap-1">{primaryNavLinks(() => {})}</nav>
          <div className="mt-auto shrink-0">
            <ReferAndEarnCard />
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

interface AccountMenuProps {
  profile: { partnerId?: string | null; trainerId?: string | null } | null | undefined;
  showCourseBuilder: boolean;
  creatorEnt: { commerceEnabled: boolean };
  onNavigate: () => void;
  onSignOut: () => void;
}

// The account/content/workspace menu that used to be 9+ separate flat
// sidebar links. Grouped into three short sections so it stays scannable
// even though it now carries everything the primary nav doesn't.
//
// Creator/Trainer/Partner links keep the exact same profile-flag gating the
// old sidebar used (profile?.partnerId, profile?.trainerId,
// showCourseBuilder) - relocated, not re-decided. A full "workspace
// switcher" UI (a genuine Learner/Creator or Learner/Partner mode toggle
// with its own dedicated nav set, per the blueprint's Section 3) is Phase
// 5's own scope item ("Role switcher") in the blueprint's own phase table -
// this menu is the Phase 2/3 stopgap that gets these links out of the
// primary learner nav without yet building that larger switcher.
function AccountMenu({ profile, showCourseBuilder, creatorEnt, onNavigate, onSignOut }: AccountMenuProps) {
  const itemClass = 'block rounded-lg px-3 py-2 text-sm text-ink hover:bg-surface-sunken';
  return (
    <div
      role="menu"
      className="absolute right-0 top-10 z-30 w-64 rounded-xl border border-surface-border bg-surface-raised p-2 shadow-pop"
    >
      <div className="space-y-0.5">
        <Link role="menuitem" to="/home/my-learning" onClick={onNavigate} className={itemClass}>
          My Learning
        </Link>
        <Link role="menuitem" to="/home/certificates" onClick={onNavigate} className={itemClass}>
          My Certificates
        </Link>
        <Link role="menuitem" to="/home/purchases" onClick={onNavigate} className={itemClass}>
          Billing &amp; Orders
        </Link>
        <Link role="menuitem" to="/home/wishlist" onClick={onNavigate} className={itemClass}>
          Saved Items
        </Link>
        <Link role="menuitem" to="/home/custom-exams" onClick={onNavigate} className={itemClass}>
          Custom Exam Builder
        </Link>
      </div>

      <div className="my-2 border-t border-surface-border" />

      <div className="space-y-0.5">
        <Link role="menuitem" to="/home/profile" onClick={onNavigate} className={itemClass}>
          My Profile
        </Link>
        <Link role="menuitem" to="/home/profile" onClick={onNavigate} className={itemClass}>
          Refer &amp; Earn
        </Link>
        <Link role="menuitem" to="/home/settings" onClick={onNavigate} className={itemClass}>
          Settings
        </Link>
      </div>

      <div className="my-2 border-t border-surface-border" />

      <div className="space-y-0.5">
        <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Workspaces</p>
        {profile?.partnerId ? (
          <>
            <Link role="menuitem" to="/home/partner" onClick={onNavigate} className={itemClass}>
              Partner Dashboard
            </Link>
            <Link role="menuitem" to="/home/creator" onClick={onNavigate} className={itemClass}>
              Creator Workspace
            </Link>
          </>
        ) : (
          <Link role="menuitem" to="/home/become-a-partner" onClick={onNavigate} className={itemClass}>
            Become a Partner
          </Link>
        )}
        <Link role="menuitem" to="/home/trainer" onClick={onNavigate} className={itemClass}>
          {profile?.trainerId ? 'Trainer Workspace' : 'Become a Trainer'}
        </Link>
        {showCourseBuilder && (
          <Link role="menuitem" to="/home/creator/courses" onClick={onNavigate} className={itemClass}>
            {creatorEnt.commerceEnabled ? 'Course Builder' : 'AI Course Builder'}
          </Link>
        )}
        <Link role="menuitem" to="/home/creator/plans" onClick={onNavigate} className={itemClass}>
          Creator Plans
        </Link>
      </div>

      <div className="my-2 border-t border-surface-border" />

      <button
        type="button"
        onClick={() => {
          onNavigate();
          onSignOut();
        }}
        className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-danger hover:bg-danger-soft"
      >
        Sign Out
      </button>
    </div>
  );
}

// Links to My Profile's own "Refer & Earn" section - that's where the
// actual referral link, copy button, and referral history live (see
// ReferAndEarnSection.tsx); this sidebar card is just a permanent
// reminder/entry point, same role the exam countdown cards play above it.
//
// The reward figure below used to be a hardcoded "₹500" with no relation
// to the actual admin-configured reward (appSettings/general.
// referralCreditAmountMinor, which defaults to ₹250) - see
// useReferralProgramSettings for where the real value now comes from. If
// that setting hasn't been re-saved since this fix shipped, the doc it
// reads won't exist yet and the card falls back to generic copy with no
// number, rather than guessing one.
function ReferAndEarnCard({ className = '' }: { className?: string }) {
  const { data: referralSettings } = useReferralProgramSettings();

  return (
    <Link to="/home/profile" className={`block w-full rounded-lg border border-brand-500/30 bg-brand-50 p-3 text-left ${className}`}>
      <div className="flex items-center gap-2.5">
        <span className="text-xl" aria-hidden="true">
          🎁
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink">Refer & Earn</div>
          <div className="text-xs text-ink-faint">{referralSettings ? 'Invite friends and earn' : 'Invite friends and earn HelpCertify credit'}</div>
        </div>
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        {referralSettings && <span className="text-base font-bold text-brand-ink">{formatMoney(referralSettings.creditAmountMinor, 'INR')}</span>}
        <span className="ml-auto text-sm text-brand-ink">→</span>
      </div>
    </Link>
  );
}
