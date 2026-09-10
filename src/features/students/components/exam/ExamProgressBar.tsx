import clsx from 'clsx';

// Thin rounded progress track used on the exam browse cards and the
// per-certification detail header. Same visual language as the inline bar
// already on PracticeTestDetailPage, pulled out so every surface matches.
export function ExamProgressBar({
  pct,
  label,
  className,
}: {
  pct: number;
  label?: string;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div className={className}>
      {label != null && (
        <div className="mb-1 flex items-center justify-between text-xs text-ink-faint">
          <span>{label}</span>
          <span className="[font-variant-numeric:tabular-nums]">{clamped}%</span>
        </div>
      )}
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={clsx('h-full rounded-full bg-brand-500 transition-[width]')} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}
