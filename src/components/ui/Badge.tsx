import type { ReactNode } from 'react';
import clsx from 'clsx';

// Status pill. `tone` is semantic - map a domain status (draft / published
// / rejected / ...) to one of these five, never a raw colour. A dot
// prefix keeps it legible without relying on colour alone.
export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-sunken text-ink-faint border-surface-border',
  brand: 'bg-brand-50 text-brand-ink border-transparent',
  success: 'bg-success-soft text-success border-transparent',
  warning: 'bg-warning-soft text-warning border-transparent',
  danger: 'bg-danger-soft text-danger border-transparent',
};

export function Badge({
  tone = 'neutral',
  dot = true,
  className,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold leading-relaxed',
        TONES[tone],
        className,
      )}
    >
      {dot && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-90" />}
      {children}
    </span>
  );
}
