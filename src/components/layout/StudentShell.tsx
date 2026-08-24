import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { authApi } from '@/features/auth/api/authApi';
import { Logo } from '@/components/brand/Logo';
import { ProfileModal } from '@/features/students/components/ProfileModal';

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
export function StudentShell() {
  const profile = useAuthStore((s) => s.profile);
  const navigate = useNavigate();
  const [showProfile, setShowProfile] = useState(false);

  const handleSignOut = async () => {
    await authApi.logout();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen bg-surface">
      <aside className="flex w-64 shrink-0 flex-col border-r border-surface-border p-6">
        <Logo size="sm" />
        <span className="mt-1 text-xs uppercase tracking-wide text-neutral-500">Academic Portal</span>

        <nav className="mt-8 flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setShowProfile(true)}
            className="rounded-lg px-3 py-2 text-left text-sm text-neutral-300 hover:bg-white/5"
          >
            My Profile
          </button>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
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
        </nav>

        <button
          type="button"
          onClick={handleSignOut}
          className="mt-auto rounded-lg border border-surface-border py-2 text-sm text-neutral-300 hover:border-red-500/50 hover:text-red-400"
        >
          Sign Out
        </button>
      </aside>

      <div className="flex-1">
        <header className="flex items-center justify-between border-b border-surface-border px-8 py-5">
          <div>
            <div className="text-sm text-neutral-400">Welcome back</div>
            <div className="text-xl font-semibold text-white">{profile?.name}</div>
          </div>
        </header>
        <main className="p-8">
          <Outlet />
        </main>
      </div>

      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
    </div>
  );
}
