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

const registerSchema = z.object({
  name: z.string().min(2, 'Name is too short'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters'),
});

type RegisterForm = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const pushToast = useUiStore((s) => s.pushToast);

  useEffect(() => {
    if (profile) navigate(profile.role === 'admin' ? '/admin' : '/home', { replace: true });
  }, [profile, navigate]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });

  const mutation = useMutation({
    mutationFn: authApi.register,
    onError: (err) => pushToast(friendlyAuthError(err, 'Registration failed'), 'error'),
  });

  const googleMutation = useMutation({
    mutationFn: authApi.signInWithGoogle,
    onError: (err) => pushToast(friendlyAuthError(err, 'Google sign-in failed'), 'error'),
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm rounded-xl border border-surface-border bg-surface-raised p-8">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <h1 className="mb-6 text-center text-xl font-bold text-ink">Create your account</h1>

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

        {/* noValidate: see LoginPage.tsx — native type="email" constraint
            validation would otherwise block the submit event before Zod's
            error message ever gets a chance to render. */}
        <form noValidate onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium text-ink-muted">
              Name
            </label>
            <input
              id="name"
              className="w-full rounded-lg border border-surface-border bg-black/30 px-3 py-2 text-ink outline-none focus:border-brand-400"
              {...register('name')}
            />
            {errors.name && <p className="mt-1 text-sm text-red-400">{errors.name.message}</p>}
          </div>
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
            className="w-full rounded-lg bg-[#155EEF] py-2 font-medium text-surface disabled:opacity-60"
          >
            {mutation.isPending ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-ink-faint">
          Already have an account?{' '}
          <Link to="/login" className="text-brand-ink underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
