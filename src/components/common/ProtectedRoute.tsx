import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { Spinner } from './Spinner';
import type { Role } from '@/types/api';

interface ProtectedRouteProps {
  allowedRoles?: Role[];
}

// Used as a layout route in router.tsx: <Route element={<ProtectedRoute />}>
// wraps every child route that needs a session; pass allowedRoles to also
// gate by role (e.g. admin-only routes).
export function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const profile = useAuthStore((s) => s.profile);
  const isInitializing = useAuthStore((s) => s.isInitializing);
  const location = useLocation();

  // Firebase Auth's local session check is async — without this, a hard
  // refresh would show profile === null for a moment and bounce a
  // genuinely-signed-in user straight back to /login.
  if (isInitializing) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!profile) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
