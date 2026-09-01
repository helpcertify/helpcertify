import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api/authApi';
import { useAuthStore } from '../store/useAuthStore';
import { useUiStore } from '@/store/useUiStore';
import { friendlyAuthError } from '@/lib/errorMessages';
import { ThemeToggle } from '@/components/common/ThemeToggle';

interface AdminAccessModalProps {
  onClose: () => void;
}

const adminLoginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});
type AdminLoginForm = z.infer<typeof adminLoginSchema>;

// Matches the reference screenshots' "Admin Access" card: a plain
// email/password login gated to role === 'admin', reusing the same Firebase
// Auth session as the student side - just a different entry point and a
// role check after sign-in, rather than a separate credential system.
export function AdminAccessModal({ onClose }: AdminAccessModalProps) {
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const pushToast = useUiStore((s) => s.pushToast);
  // Tracks "we just signed in from this modal" so the profile-watching
  // effect below doesn't react to some unrelated pre-existing session.
  const awaitingRoleCheck = useRef(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AdminLoginForm>({ resolver: zodResolver(adminLoginSchema) });

  const mutation = useMutation({
    mutationFn: authApi.login,
    onMutate: () => {
      awaitingRoleCheck.current = true;
    },
    onError: (err) => {
      awaitingRoleCheck.current = false;
      pushToast(friendlyAuthError(err, 'Sign-in failed'), 'error');
    },
  });

  useEffect(() => {
    if (!awaitingRoleCheck.current || !profile) return;
    awaitingRoleCheck.current = false;

    if (profile.role !== 'admin') {
      authApi.logout();
      pushToast('This account does not have admin access.', 'error');
      return;
    }
    onClose();
    navigate('/admin', { replace: true });
  }, [profile, navigate, onClose, pushToast]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl border border-surface-border bg-surface-raised p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">Admin Access</h2>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button type="button" onClick={onClose} aria-label="Close" className="text-ink-faint hover:text-ink">
              ✕
            </button>
          </div>
        </div>

        <form noValidate onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
          <div>
            <label htmlFor="admin-email" className="mb-1 block text-sm font-medium text-ink-muted">
              Email
            </label>
            <input
              id="admin-email"
              type="email"
              placeholder="admin@example.com"
              className="input-dark focus:ring-2 focus:ring-brand-400"
              {...register('email')}
            />
            {errors.email && <p className="mt-1 text-sm text-red-400">{errors.email.message}</p>}
          </div>
          <div>
            <label htmlFor="admin-password" className="mb-1 block text-sm font-medium text-ink-muted">
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              className="input-dark focus:ring-2 focus:ring-brand-400"
              {...register('password')}
            />
            {errors.password && <p className="mt-1 text-sm text-red-400">{errors.password.message}</p>}
          </div>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="w-full rounded-lg bg-[#155EEF] py-2.5 font-medium text-surface disabled:opacity-60"
          >
            {mutation.isPending ? 'Checking…' : 'Access Dashboard'}
          </button>
        </form>
      </div>
    </div>
  );
}
