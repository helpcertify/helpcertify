import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { authApi } from '../api/authApi';
import { useAuthStore } from '../store/useAuthStore';
import { useUiStore } from '@/store/useUiStore';
import { GoogleButton } from '@/components/common/GoogleButton';
import { Logo } from '@/components/brand/Logo';
import { friendlyAuthError } from '@/lib/errorMessages';
import { ThemeToggle } from '@/components/common/ThemeToggle';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const pushToast = useUiStore((s) => s.pushToast);

  // Navigate once initAuth.ts's listener actually populates the profile,
  // rather than right after the mutation resolves — signInWithEmailAndPassword
  // resolving doesn't guarantee onAuthStateChanged has fired yet.
  useEffect(() => {
    if (profile) navigate(profile.role === 'admin' ? '/admin' : '/home', { replace: true });
  }, [profile, navigate]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  const mutation = useMutation({
    mutationFn: authApi.login,
    onError: (err) => pushToast(friendlyAuthError(err, 'Login failed'), 'error'),
  });

  const googleMutation = useMutation({
    mutationFn: authApi.signInWithGoogle,
    onError: (err) => pushToast(friendlyAuthError(err, 'Google sign-in failed'), 'error'),
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm rounded-xl border border-surface-border bg-surface-raised p-8">
        {/* Same theme toggle the Admin Access modal has, so both login
            entry points offer the same pre-login controls. */}
        <div className="mb-6 flex items-center justify-between">
          <Logo />
          <ThemeToggle />
        </div>
        <h1 className="mb-6 text-center text-xl font-bold text-ink">Welcome back</h1>

        <GoogleButton
          label={googleMutation.isPending ? 'Signing in…' : 'Continue with Google'}
          disabled={googleMutation.isPending}
          onClick={() => googleMutation.mutate()}
        />

        <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wide text-ink-faint">
          <div className="h-px flex-1 bg-surface-border" />
          or
          <div className="h-px flex-1 bg-surface-border" />
        </div>

        {/* noValidate: hand validation entirely to Zod/React Hook Form — without
            it, the browser's native type="email" constraint check blocks the
            submit event before handleSubmit ever runs, so our error message
            never renders. */}
        <form noValidate onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-ink-muted">
              Email
            </label>
            <input
              id="email"
              type="email"
              className="w-full rounded-lg border border-surface-border bg-black/30 px-3 py-2 text-ink outline-none focus:border-brand-400"
              {...register('email')}
            />
            {errors.email && <p className="mt-1 text-sm text-red-400">{errors.email.message}</p>}
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-ink-muted">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="w-full rounded-lg border border-surface-border bg-black/30 px-3 py-2 text-ink outline-none focus:border-brand-400"
              {...register('password')}
            />
            {errors.password && <p className="mt-1 text-sm text-red-400">{errors.password.message}</p>}
          </div>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="w-full rounded-lg bg-[#1D4ED8] py-2 font-medium text-surface disabled:opacity-60"
          >
            {mutation.isPending ? 'Logging in…' : 'Log in'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-ink-faint">
          No account?{' '}
          <Link to="/register" className="text-brand-ink underline">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
