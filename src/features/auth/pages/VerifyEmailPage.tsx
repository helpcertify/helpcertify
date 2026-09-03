import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '../api/authApi';
import { refreshProfile } from '../initAuth';
import { useAuthStore } from '../store/useAuthStore';
import { useUiStore } from '@/store/useUiStore';
import { Logo } from '@/components/brand/Logo';
import { friendlyAuthError } from '@/lib/errorMessages';

const RESEND_COOLDOWN_SECONDS = 30;

// Reached only when a signed-in account still has emailVerified === false
// (see ProtectedRoute) - not itself wrapped in ProtectedRoute, since a
// route that requires verification can't also be the one you're sent to
// verify. Handles its own redirects instead: away if not signed in at all,
// onward to /home if this account turns out to already be verified.
export function VerifyEmailPage() {
  const navigate = useNavigate();
  const firebaseUser = useAuthStore((s) => s.firebaseUser);
  const profile = useAuthStore((s) => s.profile);
  const isInitializing = useAuthStore((s) => s.isInitializing);
  const pushToast = useUiStore((s) => s.pushToast);
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (isInitializing) return;
    if (!firebaseUser) {
      navigate('/login', { replace: true });
    } else if (profile?.emailVerified) {
      navigate(profile.role === 'admin' || profile.role === 'finance_admin' ? '/admin' : '/home', { replace: true });
    }
  }, [isInitializing, firebaseUser, profile, navigate]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const verifyMutation = useMutation({
    mutationFn: () => authApi.verifyEmailOtp(code),
    onSuccess: async () => {
      pushToast('Email verified', 'success');
      await refreshProfile();
      navigate(profile?.role === 'admin' || profile?.role === 'finance_admin' ? '/admin' : '/home', { replace: true });
    },
    onError: (err) => pushToast(friendlyAuthError(err, 'Verification failed'), 'error'),
  });

  const resendMutation = useMutation({
    mutationFn: () => authApi.resendEmailOtp(),
    onSuccess: () => {
      pushToast('A new code has been sent', 'success');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    },
    onError: (err) => pushToast(friendlyAuthError(err, 'Could not resend the code'), 'error'),
  });

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-xl border border-surface-border bg-surface-raised p-8">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <h1 className="mb-2 text-center text-xl font-bold text-ink">Verify your email</h1>
        <p className="mb-6 text-center text-sm text-ink-faint">
          We sent a 6-digit code to <span className="text-ink">{profile?.email}</span>. Enter it below to continue.
        </p>

        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            verifyMutation.mutate();
          }}
          className="space-y-4"
        >
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="w-full rounded-lg border border-surface-border bg-black/30 px-3 py-2 text-center text-2xl tracking-[0.5em] text-ink outline-none focus:border-brand-400"
          />
          <button
            type="submit"
            disabled={verifyMutation.isPending || code.length !== 6}
            className="w-full rounded-lg bg-[#155EEF] py-2 font-medium text-surface disabled:opacity-60"
          >
            {verifyMutation.isPending ? 'Verifying…' : 'Verify'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => resendMutation.mutate()}
          disabled={resendMutation.isPending || cooldown > 0}
          className="mt-4 w-full text-center text-sm text-brand-ink underline disabled:no-underline disabled:text-ink-faint"
        >
          {cooldown > 0 ? `Resend code in ${cooldown}s` : resendMutation.isPending ? 'Sending…' : 'Resend code'}
        </button>
      </div>
    </div>
  );
}
