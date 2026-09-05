import type { HTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

// The canonical panel: a white (dark: raised) surface lifted off the
// tinted page with a soft shadow. Replaces ~86 hand-written
// `rounded-xl border border-surface-border bg-surface-raised` strings and
// ~31 hardcoded `border-[#E2E8F0] bg-white` ones.
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx('rounded-xl border border-surface-border bg-surface-raised shadow-card', className)}
      {...rest}
    />
  );
}

export function CardHeader({
  title,
  actions,
  className,
  children,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={clsx('flex items-center justify-between gap-3 border-b border-surface-border px-5 py-4', className)}>
      {title ? <h3 className="text-sm font-bold text-ink">{title}</h3> : children}
      {actions}
    </div>
  );
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx('p-5', className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('flex items-center justify-end gap-2 border-t border-surface-border px-5 py-3', className)} {...rest} />
  );
}
