import type { ReactNode } from 'react';
import clsx from 'clsx';

// KPI tile for dashboards / earnings panels. `delta` is an optional
// change line; `tone` colours it (up = success). Keep numbers tabular.
export function StatCard({
  label,
  value,
  delta,
  tone = 'neutral',
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  delta?: ReactNode;
  tone?: 'neutral' | 'up' | 'down';
  className?: string;
}) {
  return (
    <div className={clsx('rounded-xl border border-surface-border bg-surface-raised p-4 shadow-card', className)}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{label}</div>
      <div className="mt-2 text-2xl font-extrabold tracking-tight text-ink [font-variant-numeric:tabular-nums]">{value}</div>
      {delta != null && (
        <div
          className={clsx(
            'mt-1.5 text-xs',
            tone === 'up' && 'text-success',
            tone === 'down' && 'text-danger',
            tone === 'neutral' && 'text-ink-faint',
          )}
        >
          {delta}
        </div>
      )}
    </div>
  );
}
