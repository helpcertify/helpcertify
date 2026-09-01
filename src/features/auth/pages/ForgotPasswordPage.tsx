import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { FirebaseError } from 'firebase/app';
import { authApi } from '../api/authApi';
import { useUiStore } from '@/store/useUiStore';
import { Logo } from '@/components/brand/Logo';
import { friendlyAuthError } from '@/lib/errorMessages';

const schema = z.object({ email: z.string().email('Enter a valid email') });
type Form = z.infer<typeof schema>;

// Sends a Firebase password-reset email. We always show the same "if an
// account exists, we've sent a link" confirmation regardless of whether the
// address is registered — this matches Firebase's own email-enumeration
// protection and avoids revealing which emails have accounts.
export function ForgotPasswordPage() {
  const pushToast = useUiStore((s) => s.pushToast);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  const mutation = useMutation({
    mutationFn: async ({ email }: Form) => {
      try {
        await authApi.forgotPassword(email.trim());
      } catch (err) {
        // Treat "no such account" as success so this page never reveals
        // which emails are registered, whether or not the Firebase project
        // has email-enumeration protection enabled.
        if (err instanceof FirebaseError && err.code === 'auth/user-not-found') return;
        throw err;
      }
    },
    onSuccess: (_data, { email }) => setSentTo(email.trim()),
    onError: (err) => pushToast(friendlyAuthError(err, 'Could not send the reset email'), 'error'),
  });

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-xl border border-surface-border bg-surface-raised p-8">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>

        {sentTo ? (
          <>
            <h1 className="mb-2 text-center text-xl font-bold text-ink">Check your email</h1>
            <p className="mb-6 text-center text-sm text-ink-faint">
              If an account exists for <span className="text-ink">{sentTo}</span>, we&rsquo;ve
              sent a link to reset your password. The link expires after a while &mdash; request
              a new one if it does. Also check your spam folder.
            </p>
            <Link
              to="/login"
              className="block w-full rounded-lg bg-[#155EEF] py-2 text-center font-medium text-white"
            >
              Back to log in
            </Link>
            <button
              type="button"
              onClick={() => setSentTo(null)}
              className="mt-3 w-full text-center text-sm text-brand-ink underline"
            >
              Use a different email
            </button>
          </>
        ) : (
          <>
            <h1 className="mb-2 text-center text-xl font-bold text-ink">Reset your password</h1>
            <p className="mb-6 text-center text-sm text-ink-faint">
              Enter the email on your account and we&rsquo;ll send you a link to set a new
              password.
            </p>

            <form
              noValidate
              onSubmit={handleSubmit((values) => mutation.mutate(values))}
              className="space-y-4"
            >
              <div>
                <label htmlFor="email" className="mb-1 block text-sm font-medium text-ink-muted">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  className="w-full rounded-lg border border-surface-border bg-black/30 px-3 py-2 text-ink outline-none focus:border-brand-400"
                  {...register('email')}
                />
                {errors.email && <p className="mt-1 text-sm text-red-400">{errors.email.message}</p>}
              </div>
              <button
                type="submit"
                disabled={mutation.isPending}
                className="w-full rounded-lg bg-[#155EEF] py-2 font-medium text-surface disabled:opacity-60"
              >
                {mutation.isPending ? 'Sending…' : 'Send reset link'}
              </button>
            </form>

            <p className="mt-4 text-center text-sm text-ink-faint">
              Remembered it?{' '}
              <Link to="/login" className="text-brand-ink underline">
                Log in
              </Link>
            </p>
            <p className="mt-2 text-center text-xs text-ink-faint">
              Signed up with Google? Use{' '}
              <Link to="/login" className="text-brand-ink underline">
                Continue with Google
              </Link>{' '}
              instead &mdash; those accounts don&rsquo;t have a password.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
