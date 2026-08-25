import { useState } from 'react';
import { NavLink, Link, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { authApi } from '@/features/auth/api/authApi';
import { Logo } from '@/components/brand/Logo';
import { cartApi } from '@/features/students/api/cartApi';
import { CartIcon } from '@/components/common/icons';

// "Exam Categories" used to be its own tab; its filtering moved inline onto
// the Practice Exams/Mock Exams pages themselves (see FilterBar) instead of
// sitting in the main nav. Billing & Orders (formerly "My Purchases") was
// briefly moved under My Profile, but moved back to its own tab on request
// so learners can reach their purchase history directly from the sidebar.
// The first tab (still routed to /home, the dashboard) is labeled "Learning
// Portal" rather than "Home" on request; the old "LEARNING PORTAL" subtitle
// under the logo above was dropped at the same time so the name isn't
// shown twice.
const NAV_ITEMS = [
  { to: '/home', label: 'Learning Portal', end: true },
  { to: '/home/practice-tests', label: 'Practice Exams' },
  { to: '/home/mock-exams', label: 'Mock Exams' },
  { to: '/home/past-quizzes', label: 'My Attempts' },
  { to: '/home/purchases', label: 'Billing & Orders' },
  { to: '/home/wishlist', label: 'Saved Items' },
];

// My Profile and Settings are account-level, not content tabs, so they're
// pinned on after NAV_ITEMS instead of mixed into it: Settings last, My
// Profile directly above it. Both are real routes now (My Profile used to
// open a modal — moved to its own page/route on request), so both get the
// same active-state NavLink styling for free.

// Matches the reference screenshots' "Learning Portal" student shell: a
// left sidebar (brand, nav, sign out) + a top strip. No department/
// academic-year badges here — this platform isn't limited to students at
// an institution, so profile fields stay generic (name, email, avatar)
// rather than campus-specific.
//
// The fixed-width sidebar only renders from lg: up — on a real phone
// (confirmed live, ~360-400px wide) a 256px-wide sidebar squeezed the actual
// page content into a sliver next to it. Below lg:, a compact top bar with
// a hamburger toggle takes its place instead.
export function StudentShell() {
  const profile = useAuthStore((s) => s.profile);
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // staleTime keeps this from refetching on every focus/route-change — the
  // count only actually changes from an add/remove/checkout, and those
  // mutations already invalidate this same query key themselves.
  const { data: cart } = useQuery({ queryKey: ['student', 'cart'], queryFn: cartApi.getCart, staleTime: 30_000 });
  const cartCount = cart?.items.length ?? 0;

  const handleSignOut = async () => {
    await authApi.logout();
    navigate('/login');
  };

  // text-ink (not text-ink-muted) for the inactive state — real user
  // feedback that nav tab labels needed to read as solidly dark, not a
  // secondary/muted gray, to stay clearly visible.
  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    clsx('rounded-lg px-3 py-2 text-sm', isActive ? 'bg-brand-500/15 text-brand-ink' : 'text-ink hover:bg-white/5');

  const navLinks = (onNavigate: () => void) => (
    <>
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} onClick={onNavigate} className={navLinkClass}>
          {item.label}
        </NavLink>
      ))}
      <NavLink to="/home/profile" onClick={onNavigate} className={navLinkClass}>
        My Profile
      </NavLink>
      <NavLink to="/home/settings" onClick={onNavigate} className={navLinkClass}>
        Settings
      </NavLink>
    </>
  );

  return (
    <div className="min-h-screen bg-surface lg:flex">
      {/* Desktop sidebar — lg: and up only. Pinned to the viewport (sticky +
          h-screen) rather than just stretching to match the main column's
          height — without this, a long page (a big quiz grid, say) made the
          whole row taller than the viewport, and "Sign Out" (mt-auto)
          ended up pushed down to the bottom of that stretched sidebar
          instead of staying put at the bottom of the screen. The nav itself
          scrolls internally (overflow-y-auto) if it ever grows past what
          fits, so Sign Out never gets crowded off-screen either. */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-surface-border p-6 lg:flex">
        <Logo size="sm" />
        <nav className="mt-8 flex flex-1 flex-col gap-1 overflow-y-auto">{navLinks(() => {})}</nav>
        <button
          type="button"
          onClick={handleSignOut}
          className="mt-auto shrink-0 rounded-lg border border-surface-border py-2 text-sm text-ink hover:border-red-500/50 hover:text-red-400"
        >
          Sign Out
        </button>
      </aside>

      {/* Mobile top bar — below lg: only */}
      <div className="border-b border-surface-border lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Logo size="sm" />
          <button
            type="button"
            onClick={() => setMobileNavOpen((v) => !v)}
            aria-label="Toggle menu"
            className="rounded-lg border border-surface-border px-3 py-1.5 text-lg text-ink-muted"
          >
            {mobileNavOpen ? '✕' : '☰'}
          </button>
        </div>
        {mobileNavOpen && (
          <nav className="flex flex-col gap-1 border-t border-surface-border p-4">
            {navLinks(() => setMobileNavOpen(false))}
            <button
              type="button"
              onClick={handleSignOut}
              className="mt-2 rounded-lg border border-surface-border py-2 text-sm text-ink hover:border-red-500/50 hover:text-red-400"
            >
              Sign Out
            </button>
          </nav>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between border-b border-surface-border px-4 py-4 lg:px-8 lg:py-5">
          <div>
            <div className="text-sm text-ink-faint">Welcome back</div>
            <div className="text-xl font-semibold text-ink">{profile?.name}</div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/home/cart"
              aria-label="Cart"
              className="relative flex flex-col items-center gap-0.5 rounded-full border border-[#1D4ED8] bg-[#1D4ED8] px-3.5 py-1.5 text-white hover:opacity-90"
            >
              <CartIcon className="h-5 w-5" />
              <span className="text-[10px] font-medium leading-none">Cart</span>
              {cartCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-semibold text-white ring-2 ring-surface">
                  {cartCount}
                </span>
              )}
            </Link>
          </div>
        </header>
        <main className="p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
