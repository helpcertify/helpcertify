import clsx from 'clsx';
import type { ExamBrowseTab, ExamLayout } from './browseFilter';

const TABS: { id: ExamBrowseTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'available', label: 'Available' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'completed', label: 'Completed' },
];

export function ExamBrowseControls({
  tab,
  onTab,
  counts,
  search,
  onSearch,
  layout,
  onLayout,
}: {
  tab: ExamBrowseTab;
  onTab: (t: ExamBrowseTab) => void;
  counts: Record<ExamBrowseTab, number>;
  search: string;
  onSearch: (s: string) => void;
  layout: ExamLayout;
  onLayout: (l: ExamLayout) => void;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <div className="flex flex-wrap gap-1.5" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => onTab(t.id)}
            className={clsx(
              'rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors',
              tab === t.id
                ? 'bg-brand-500 text-white'
                : 'bg-surface-sunken text-ink-muted hover:bg-surface-border/60',
            )}
          >
            {t.label} <span className="opacity-70">({counts[t.id]})</span>
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search certifications…"
          aria-label="Search certifications"
          className="input-dark w-full sm:w-56"
        />
        <div className="flex overflow-hidden rounded-lg border border-surface-border">
          {(['grid', 'list'] as const).map((l) => (
            <button
              key={l}
              type="button"
              aria-label={`${l} view`}
              aria-pressed={layout === l}
              onClick={() => onLayout(l)}
              className={clsx(
                'px-2.5 py-1.5 text-xs font-semibold transition-colors',
                layout === l ? 'bg-brand-500 text-white' : 'bg-surface-raised text-ink-faint hover:text-ink',
              )}
            >
              {l === 'grid' ? '▦' : '☰'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
