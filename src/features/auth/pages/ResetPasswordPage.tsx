import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../api/authApi';
import { useUiStore } from '@/store/useUiStore';
import { Logo } from '@/components/brand/Logo';
import { friendlyAuthError } from '@/lib/errorMessages';
import { PasswordInput } from '@/components/common/PasswordInput';

const schema = z
  .object({
    password: z.string().min(8, 'At least 8 characters'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });
type Form = z.infer<typeof schema>;

// Handles the link in a Firebase password-reset email
// (?oobCode=...&mode=resetPassword). Also the "Continue" target after
// Firebase's own hosted reset page, in which case there's no oobCode and we
// just point the user at log in.
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const pushToast = useUiStore((s) => s.pushToast);
  const [done, setDone] = useState(false);

  const oobCode = params.get('oobCode');
  const mode = params.get('mode');
  const isResetLink = !!oobCode && (mode === 'resetPassword' || mode === null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  // Validate the code up front so an expired/used link shows a clear
  // message instead of failing only on submit.
  const codeCheck = useQuery({
    queryKey: ['auth', 'resetCode', oobCode],
    queryFn: () => authApi.verifyPasswordResetCode(oobCode!),
    enabled: isResetLink,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: ({ password }: Form) => authApi.confirmPasswordReset(oobCode!, password),
    onSuccess: () => {
      setDone(true);
      pushToast('Password updated. You can now log in.', 'success');
    },
    onError: (err) => pushToast(friendlyAuthError(err, 'Could not reset your password'), 'error'),
  });

  useEffect(() => {
    if (done) {
      const t = setTimeout(() => navigate('/login', { replace: true }), 2500);
      return () => clearTimeout(t);
    }
  }, [done, navigate]);

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-xl border border-surface-border bg-surface-raised p-8">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>

        {!isResetLink ? (
          <>
            <h1 className="mb-2 text-center text-xl font-bold text-ink">Reset your password</h1>
            <p className="mb-6 text-center text-sm text-ink-faint">
              Open the reset link from your email on this device, or request a new one.
            </p>
            <Link to="/forgot-password" className="block w-full rounded-lg bg-[#155EEF] py-2 text-center font-medium text-white">
              Send a reset link
            </Link>
            <Link to="/login" className="mt-3 block w-full text-center text-sm text-brand-ink underline">
              Back to log in
            </Link>
          </>
        ) : done ? (
          <>
            <h1 className="mb-2 text-center text-xl font-bold text-ink">Password updated</h1>
            <p className="mb-6 text-center text-sm text-ink-faint">Taking you to the login page&hellip;</p>
            <Link to="/login" className="block w-full rounded-lg bg-[#155EEF] py-2 text-center font-medium text-white">
              Log in now
            </Link>
          </>
        ) : codeCheck.isLoading ? (
          <p className="text-center text-sm text-ink-faint">Checking your reset link&hellip;</p>
        ) : codeCheck.isError ? (
          <>
            <h1 className="mb-2 text-center text-xl font-bold text-ink">This link has expired</h1>
            <p className="mb-6 text-center text-sm text-ink-faint">
              Password reset links can only be used once and expire after a while. Request a
              fresh one.
            </p>
            <Link to="/forgot-password" className="block w-full rounded-lg bg-[#155EEF] py-2 text-center font-medium text-white">
              Send a new reset link
            </Link>
            <Link to="/login" className="mt-3 block w-full text-center text-sm text-brand-ink underline">
              Back to log in
            </Link>
          </>
        ) : (
          <>
            <h1 className="mb-2 text-center text-xl font-bold text-ink">Set a new password</h1>
            <p className="mb-6 text-center text-sm text-ink-faint">
              For <span className="text-ink">{codeCheck.data}</span>
            </p>
            <form noValidate onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
              <div>
                <label htmlFor="password" className="mb-1 block text-sm font-medium text-ink-muted">
                  New password
                </label>
                <PasswordInput
                  id="password"
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-surface-border bg-black/30 px-3 py-2 text-ink outline-none focus:border-brand-400"
                  {...register('password')}
                />
                {errors.password && <p className="mt-1 text-sm text-red-400">{errors.password.message}</p>}
              </div>
              <div>
                <label htmlFor="confirm" className="mb-1 block text-sm font-medium text-ink-muted">
                  Confirm new password
                </label>
                <PasswordInput
                  id="confirm"
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-surface-border bg-black/30 px-3 py-2 text-ink outline-none focus:border-brand-400"
                  {...register('confirm')}
                />
                {errors.confirm && <p className="mt-1 text-sm text-red-400">{errors.confirm.message}</p>}
              </div>
              <button
                type="submit"
                disabled={mutation.isPending}
                className="w-full rounded-lg bg-[#155EEF] py-2 font-medium text-surface disabled:opacity-60"
              >
                {mutation.isPending ? 'Updating…' : 'Update password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
