import type { ReactNode } from 'react';
import clsx from 'clsx';

// The underline tab bar used on the lesson editor, the course reader, the
// products page, etc. Controlled: the parent owns the active value.
export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
  hidden?: boolean;
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  const shown = items.filter((t) => !t.hidden);
  return (
    <div className={clsx('flex flex-wrap gap-1 border-b border-surface-border', className)} role="tablist">
      {shown.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={clsx(
            '-mb-px border-b-2 px-3.5 py-2.5 text-sm font-semibold transition-colors',
            value === t.id
              ? 'border-brand-500 text-brand-500'
              : 'border-transparent text-ink-faint hover:text-ink',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
