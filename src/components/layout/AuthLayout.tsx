import { Outlet } from 'react-router-dom';
import { SiteFooter } from '@/components/layout/SiteFooter';

// Wraps the pre-login screens (login, register, password reset, email
// verification) so they carry the same small grey site footer as the rest
// of the app. Each page renders a `flex-1` centered card into the Outlet.
export function AuthLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <div className="flex flex-1 flex-col">
        <Outlet />
      </div>
      <SiteFooter />
    </div>
  );
}
