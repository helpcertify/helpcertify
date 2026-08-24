import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { authApi } from '@/features/auth/api/authApi';
import { Logo } from '@/components/brand/Logo';

const NAV_ITEMS = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/quizzes', label: 'Exam Quizzes' },
  { to: '/admin/practice-tests', label: 'Practice Tests' },
  { to: '/admin/performance', label: 'Performance' },
  { to: '/admin/coupons', label: 'Coupons' },
];

// The nav links were `hidden sm:flex` with no mobile fallback at all —
// confirmed live: below that breakpoint they just vanished, leaving no way
// to reach Exam Quizzes/Practice Tests/Performance on a phone. A hamburger
// toggle now takes their place below sm:.
export function AdminShell() {
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const handleSignOut = async () => {
    await authApi.logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-surface-border">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-8">
            <Logo to="/admin" size="sm" />
            <nav className="hidden gap-1 sm:flex">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    clsx(
                      'rounded-lg px-3 py-1.5 text-sm',
                      isActive ? 'bg-brand-500/15 text-brand-300' : 'text-neutral-300 hover:bg-white/5'
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSignOut}
              className="hidden rounded-lg border border-surface-border px-3 py-1.5 text-sm text-neutral-300 hover:border-red-500/50 hover:text-red-400 sm:block"
            >
              Sign Out
            </button>
            <button
              type="button"
              onClick={() => setMobileNavOpen((v) => !v)}
              aria-label="Toggle menu"
              className="rounded-lg border border-surface-border px-3 py-1.5 text-lg text-neutral-300 sm:hidden"
            >
              {mobileNavOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>
        {mobileNavOpen && (
          <nav className="flex flex-col gap-1 border-t border-surface-border p-4 sm:hidden">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMobileNavOpen(false)}
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
            <button
              type="button"
              onClick={handleSignOut}
              className="mt-2 rounded-lg border border-surface-border py-2 text-sm text-neutral-300 hover:border-red-500/50 hover:text-red-400"
            >
              Sign Out
            </button>
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
