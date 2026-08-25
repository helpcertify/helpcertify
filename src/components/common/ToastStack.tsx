import { useEffect } from 'react';
import clsx from 'clsx';
import { useUiStore } from '@/store/useUiStore';

const AUTO_DISMISS_MS = 5000;

// Mounted once at the app root (see App.tsx) so pushToast() calls from any
// page — including LoginPage/RegisterPage, which render outside any shell —
// are actually visible.
export function ToastStack() {
  const toasts = useUiStore((s) => s.toasts);
  const dismissToast = useUiStore((s) => s.dismissToast);

  useEffect(() => {
    const timers = toasts.map((t) => setTimeout(() => dismissToast(t.id), AUTO_DISMISS_MS));
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismissToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={clsx(
            'flex items-center gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg',
            toast.variant === 'success' && 'border-emerald-800 bg-emerald-950 text-emerald-300',
            toast.variant === 'error' && 'border-red-800 bg-red-950 text-red-300',
            toast.variant === 'info' && 'border-surface-border bg-surface-raised text-ink'
          )}
        >
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={() => dismissToast(toast.id)}
            className="text-current opacity-60 hover:opacity-100"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
