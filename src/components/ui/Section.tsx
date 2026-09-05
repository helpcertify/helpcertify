import type { ReactNode } from 'react';
import clsx from 'clsx';

// A titled block within a page (not a whole card). Use for the small
// uppercase-label groupings that pepper the admin forms and workspaces.
export function Section({
  title,
  description,
  actions,
  className,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={clsx('space-y-3', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3">
          <div>
            {title && (
              <h2 className="text-xs font-bold uppercase tracking-wide text-ink-faint">{title}</h2>
            )}
            {description && <p className="mt-0.5 text-sm text-ink-faint">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}
