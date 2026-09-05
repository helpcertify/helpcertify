import type { ReactNode } from 'react';
import clsx from 'clsx';

// A thin table skeleton: sunken sticky-feeling header, hairline rows, row
// hover, and a horizontal-scroll wrapper so wide tables never blow out the
// page. Callers still write their own <tr>/<td> - this just standardises
// the chrome. Drop it inside a <Card> with `p-0` for the framed look.
export function DataTable({
  head,
  children,
  empty,
  className,
}: {
  head: ReactNode;
  children: ReactNode;
  empty?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('overflow-x-auto', className)}>
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="[&>th]:border-b [&>th]:border-surface-border [&>th]:bg-surface-sunken [&>th]:px-4 [&>th]:py-2.5 [&>th]:text-[11px] [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-wide [&>th]:text-ink-faint">
            {head}
          </tr>
        </thead>
        <tbody className="[&>tr>td]:border-b [&>tr>td]:border-surface-border [&>tr>td]:px-4 [&>tr>td]:py-3 [&>tr>td]:text-ink-muted [&>tr:last-child>td]:border-b-0 [&>tr:hover>td]:bg-surface-sunken">
          {children}
        </tbody>
      </table>
      {empty}
    </div>
  );
}
