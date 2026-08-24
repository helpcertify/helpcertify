import { useState } from 'react';
import { NavLink, Link, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { authApi } from '@/features/auth/api/authApi';
import { Logo } from '@/components/brand/Logo';
import { ProfileModal } from '@/features/students/components/ProfileModal';
import { cartApi } from '@/features/students/api/cartApi';

const NAV_ITEMS = [
  { to: '/home', label: 'Available Quizzes', end: true },
  { to: '/home/past-quizzes', label: 'Past Quizzes' },
  { to: '/home/practice-tests', label: 'Practice Tests' },
];

// Matches the reference screenshots' "Academic Portal" student shell: a
// left sidebar (brand, nav, sign out) + a top strip, with My Profile as a
// modal rather than a route. No department/academic-year badges here — this
// platform isn't limited to students at an institution, so profile fields
// stay generic (name, email, avatar) rather than campus-specific.
//
// The fixed-width sidebar only renders from lg: up — on a real phone
// (confirmed live, ~360-400px wide) a 256px-wide sidebar squeezed the actual
// page content into a sliver next to it. Below lg:, a compact top bar with
// a hamburger toggle takes its place instead.
export function StudentShell() {
  const profile = useAuthStore((s) => s.profile);
  const navigate = useNavigate();
  const [showProfile, setShowProfile] = useState(false);
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

  const navLinks = (onNavigate: () => void) => (
    <>
      <button
        type="button"
        onClick={() => {
          setShowProfile(true);
          onNavigate();
        }}
        className="rounded-lg px-3 py-2 text-left text-sm text-neutral-300 hover:bg-white/5"
      >
        My Profile
      </button>
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            clsx(
              'rounded-lg px-3 py-2 text-sm',
              isActive ? 'bg-brand-500/15 text-brand-300' : 'text-neutral-300 hover:bg-white/5'
            )
          }
        >
          {item.label}
        </NavLink>
      ))}
    </>
  );

  return (
    <div className="min-h-screen bg-surface lg:flex">
      {/* Desktop sidebar — unchanged, lg: and up only */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-surface-border p-6 lg:flex">
        <Logo size="sm" />
        <span className="mt-1 text-xs uppercase tracking-wide text-neutral-500">Academic Portal</span>
        <nav className="mt-8 flex flex-col gap-1">{navLinks(() => {})}</nav>
        <button
          type="button"
          onClick={handleSignOut}
          className="mt-auto rounded-lg border border-surface-border py-2 text-sm text-neutral-300 hover:border-red-500/50 hover:text-red-400"
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
            className="rounded-lg border border-surface-border px-3 py-1.5 text-lg text-neutral-300"
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
              className="mt-2 rounded-lg border border-surface-border py-2 text-sm text-neutral-300 hover:border-red-500/50 hover:text-red-400"
            >
              Sign Out
            </button>
          </nav>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between border-b border-surface-border px-4 py-4 lg:px-8 lg:py-5">
          <div>
            <div className="text-sm text-neutral-400">Welcome back</div>
            <div className="text-xl font-semibold text-white">{profile?.name}</div>
          </div>
          <Link
            to="/home/cart"
            aria-label="Cart"
            className="relative rounded-lg border border-surface-border p-2.5 text-lg text-neutral-300 hover:border-brand-400"
          >
            🛒
            {cartCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
                {cartCount}
              </span>
            )}
          </Link>
        </header>
        <main className="p-4 lg:p-8">
          <Outlet />
        </main>
      </div>

      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
    </div>
  );
}
