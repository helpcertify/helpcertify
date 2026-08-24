import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { authApi } from '@/features/auth/api/authApi';
import { Logo } from '@/components/brand/Logo';

const NAV_ITEMS = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/quizzes', label: 'Exam Quizzes' },
  { to: '/admin/practice-tests', label: 'Practice Tests' },
  { to: '/admin/performance', label: 'Performance' },
];

export function AdminShell() {
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await authApi.logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-surface-border">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
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
          <button
            type="button"
            onClick={handleSignOut}
            className="rounded-lg border border-surface-border px-3 py-1.5 text-sm text-neutral-300 hover:border-red-500/50 hover:text-red-400"
          >
            Sign Out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
