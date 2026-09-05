import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { authApi } from '@/features/auth/api/authApi';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { Logo } from '@/components/brand/Logo';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

const NAV_ITEMS = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/products', label: 'Products & Pricing' },
  { to: '/admin/quizzes', label: 'Mock Exams' },
  { to: '/admin/practice-tests', label: 'Practice Exams' },
  { to: '/admin/performance', label: 'Learner Analytics' },
  { to: '/admin/coupons', label: 'Promo Codes' },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/referrals', label: 'Referral Audit' },
  { to: '/admin/partners', label: 'Partners' },
  { to: '/admin/creators', label: 'Creators' },
  { to: '/admin/payouts', label: 'Partner Payouts' },
  { to: '/admin/settings', label: 'Settings' },
];

// finance_admin is scoped to payouts only (see router.tsx + api/admin.ts's
// FINANCE_ADMIN_ACTIONS allowlist), so it sees just that one nav item.
const FINANCE_NAV_ITEMS = [{ to: '/admin/payouts', label: 'Partner Payouts', end: true }];

// Same shell shape as the learner's StudentShell (unified top header +
// left sidebar nav on lg: and up, a dropdown under the header on mobile) -
// the admin nav used to sit as tabs in the header itself.
export function AdminShell() {
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const role = useAuthStore((s) => s.profile?.role);
  const navItems = role === 'finance_admin' ? FINANCE_NAV_ITEMS : NAV_ITEMS;

  const handleSignOut = async () => {
    await authApi.logout();
    navigate('/');
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    clsx(
      'rounded-lg px-3 py-2 text-sm transition-colors',
      isActive ? 'bg-brand-50 font-semibold text-brand-ink' : 'text-ink hover:bg-surface-sunken',
    );

  const navLinks = (onNavigate: () => void) => (
    <>
      {navItems.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} onClick={onNavigate} className={navLinkClass}>
          {item.label}
        </NavLink>
      ))}
    </>
  );

  return (
    <div className="min-h-screen bg-surface">
      {/* Unified header - brand, theme toggle, sign out. Fixed height (h-14)
          so the sidebar below can offset its sticky position by an exact
          amount. Nav links no longer live here. */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-surface-border bg-surface-raised px-4 lg:px-8">
        <button
          type="button"
          onClick={() => setMobileNavOpen((v) => !v)}
          aria-label="Toggle menu"
          className="shrink-0 rounded-lg border border-surface-border-strong px-2.5 py-1.5 text-base text-ink-muted lg:hidden"
        >
          {mobileNavOpen ? '✕' : '☰'}
        </button>
        <Logo to="/admin" size="sm" className="shrink-0" />

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <ThemeToggle className="hidden sm:block" />
          <button
            type="button"
            onClick={handleSignOut}
            className="hidden rounded-lg border border-surface-border-strong px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:border-danger hover:text-danger sm:block"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Mobile nav dropdown - below lg: only, opened by the header hamburger. */}
      {mobileNavOpen && (
        <nav className="flex flex-col gap-1 border-b border-surface-border p-4 lg:hidden">
          {navLinks(() => setMobileNavOpen(false))}
          <div className="mt-2 flex items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={handleSignOut}
              className="flex-1 rounded-lg border border-surface-border-strong py-2 text-sm font-medium text-ink-muted hover:border-danger hover:text-danger"
            >
              Sign Out
            </button>
          </div>
        </nav>
      )}

      <div className="lg:flex">
        {/* Desktop sidebar - lg: and up only, offset below the fixed-height
            header (top-14 / h-[calc(100vh-3.5rem)] both match h-14 above). */}
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 flex-col border-r border-surface-border bg-surface-raised p-6 lg:flex">
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">{navLinks(() => {})}</nav>
        </aside>

        <div className="flex min-h-[calc(100vh-3.5rem)] min-w-0 flex-1 flex-col">
          <main className="mx-auto w-full max-w-[1640px] flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8 xl:px-14">
            <ErrorBoundary title="This admin page hit an error">
              <Outlet />
            </ErrorBoundary>
          </main>
          <SiteFooter />
        </div>
      </div>
    </div>
  );
}
