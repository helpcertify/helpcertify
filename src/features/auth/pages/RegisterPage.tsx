import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { authApi, type WelcomeCoupon } from '../api/authApi';
import { useAuthStore } from '../store/useAuthStore';
import { useUiStore } from '@/store/useUiStore';
import { GoogleButton } from '@/components/common/GoogleButton';
import { Logo } from '@/components/brand/Logo';
import { friendlyAuthError } from '@/lib/errorMessages';
import { formatReward } from '@/utils/currency';
import { useCaptureReferral } from '@/features/partner/hooks/useCaptureReferral';

const registerSchema = z.object({
  name: z.string().min(2, 'Name is too short'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters'),
  // The learner must accept the policies before an account is created. The
  // 18+ requirement (DPDP Act, Privacy Policy "Children") lives in the
  // Terms of Service that this box agrees to, rather than as its own
  // separate affirmation.
  policiesAccepted: z.literal(true, {
    errorMap: () => ({ message: 'Please agree to the Terms of Service and Privacy Policy' }),
  }),
});

type RegisterForm = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const pushToast = useUiStore((s) => s.pushToast);
  // Refer & Earn - a referral link points here as "?ref=CODE"; carried
  // through to both signup paths below, never shown as a form field.
  const [searchParams] = useSearchParams();
  const referralCode = searchParams.get('ref')?.trim() || undefined;
  // Partner referral capture runs alongside Refer & Earn - it only reacts to
  // HCP-prefixed partner codes, learner codes stay on the path below.
  useCaptureReferral();

  useEffect(() => {
    if (profile) navigate(profile.role === 'admin' || profile.role === 'finance_admin' ? '/admin' : '/home', { replace: true });
  }, [profile, navigate]);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });
  // Gate the Google sign-up path on the same policy agreement as the email
  // form (the form itself is gated by the zod resolver).
  const policiesAccepted = watch('policiesAccepted') === true;

  // Shown once, right after a signup that used a valid referral link - the
  // coupon is already redeemable at that point, not a promise of something
  // granted later (see api/auth.ts's linkReferral). Also persisted on My
  // Profile's Refer & Earn section in case this toast gets missed (e.g. an
  // OTP-verification step interrupts before it's read).
  const announceWelcomeCoupon = (welcomeCoupon: WelcomeCoupon | null) => {
    if (!welcomeCoupon) return;
    pushToast(
      `Welcome bonus! You've got a ${formatReward(welcomeCoupon.type, welcomeCoupon.value)} coupon (code ${welcomeCoupon.code}) for your first purchase.`,
      'success'
    );
  };

  const mutation = useMutation({
    // policiesAccepted is validated client-side only - it never needs to
    // reach the API, so only the three real fields are sent.
    mutationFn: (values: RegisterForm) =>
      authApi.register({ name: values.name, email: values.email, password: values.password, referralCode }),
    onSuccess: (result) => announceWelcomeCoupon(result.welcomeCoupon),
    onError: (err) => pushToast(friendlyAuthError(err, 'Registration failed'), 'error'),
  });

  const googleMutation = useMutation({
    mutationFn: () => authApi.signInWithGoogle(referralCode),
    onSuccess: (result) => announceWelcomeCoupon(result.welcomeCoupon),
    onError: (err) => pushToast(friendlyAuthError(err, 'Google sign-in failed'), 'error'),
  });

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-xl border border-surface-border bg-surface-raised p-8">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <h1 className="mb-6 text-center text-xl font-bold text-ink">Create your account</h1>

        <GoogleButton
          label={googleMutation.isPending ? 'Signing in…' : 'Continue with Google'}
          disabled={googleMutation.isPending || !policiesAccepted}
          onClick={() => googleMutation.mutate()}
        />
        {!policiesAccepted && (
          <p className="mt-2 text-center text-xs text-ink-faint">
            Agree to the Terms of Service and Privacy Policy below to continue.
          </p>
        )}

        <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wide text-ink-faint">
          <div className="h-px flex-1 bg-surface-border" />
          or
          <div className="h-px flex-1 bg-surface-border" />
        </div>

        {/* noValidate: see LoginPage.tsx - native type="email" constraint
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
          <div>
            <label className="flex items-start gap-2 text-sm text-ink-muted">
              <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" {...register('policiesAccepted')} />
              <span>
                I agree to the{' '}
                <a href="/terms" target="_blank" rel="noopener" className="text-brand-ink underline">
                  Terms of Service
                </a>{' '}
                and{' '}
                <a href="/privacy" target="_blank" rel="noopener" className="text-brand-ink underline">
                  Privacy Policy
                </a>
                .
              </span>
            </label>
            {errors.policiesAccepted && <p className="mt-1 text-sm text-red-400">{errors.policiesAccepted.message}</p>}
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
