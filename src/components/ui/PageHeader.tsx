import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';

// The top of every page: an optional back link, the title, an optional
// one-line description, and a right-aligned actions slot. Replaces ~53
// hand-rolled `text-2xl font-bold` headings.
export function PageHeader({
  title,
  description,
  actions,
  back,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { to: string; label: string };
  className?: string;
}) {
  return (
    <div className={clsx('mb-6 flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        {back && (
          <Link to={back.to} className="mb-2 inline-block text-xs font-semibold text-brand-ink hover:underline">
            &larr; {back.label}
          </Link>
        )}
        <h1 className="text-[22px] font-extrabold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-ink-faint">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
