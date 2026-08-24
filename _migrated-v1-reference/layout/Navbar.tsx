import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { authApi } from '@/features/auth/api/authApi';

export function Navbar() {
  const profile = useAuthStore((s) => s.profile);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await authApi.logout(); // initAuth.ts's listener clears the store once Firebase confirms sign-out
    navigate('/login');
  };

  return (
    <header className="flex items-center justify-between border-b border-neutral-200 px-6 py-3 dark:border-neutral-800">
      <Link to="/" className="text-lg font-semibold text-brand-500">
        Helpcertify
      </Link>
      <nav className="flex items-center gap-4 text-sm">
        <Link to="/courses">Courses</Link>
        <Link to="/results">Results</Link>
        <Link to="/certificates">Certificates</Link>
        {profile?.role === 'admin' && <Link to="/admin">Admin</Link>}
        {(profile?.role === 'instructor' || profile?.role === 'admin') && (
          <>
            <Link to="/analytics">Analytics</Link>
            <Link to="/admin/courses/new">New course</Link>
            <Link to="/admin/uploads">Import questions</Link>
            <Link to="/admin/exams/new">New exam</Link>
          </>
        )}
        {profile ? (
          <button
            type="button"
            onClick={handleLogout}
            className="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            Log out
          </button>
        ) : (
          <Link to="/login">Log in</Link>
        )}
      </nav>
    </header>
  );
}
