import type { ReactNode } from 'react';
import clsx from 'clsx';

// One "nothing here yet" component - icon, one line, one hint, one
// optional action - replacing the dozens of ad-hoc empty blocks. Wrap it
// in a <Card> or a dashed container at the call site.
export function EmptyState({
  icon,
  title,
  hint,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('flex flex-col items-center px-6 py-12 text-center', className)}>
      {icon && <div className="mb-3.5 h-11 w-11 text-ink-faint">{icon}</div>}
      <h3 className="text-[15px] font-bold text-ink">{title}</h3>
      {hint && <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-faint">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
