import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import type { CertificationIconKey } from '@/types/models';
import { WishlistButton } from '@/components/common/WishlistButton';
import { ExamProgressBar } from './ExamProgressBar';
import { ExamSummaryMetrics, type SummaryMetric } from './ExamSummaryMetrics';

const FALLBACK_ICON: Record<CertificationIconKey, string> = {
  shield: 'M12 2 4 5v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V5l-8-3Z',
  cloud: 'M7 18a4.5 4.5 0 0 1-.4-8.98A5.5 5.5 0 0 1 17.3 8 4 4 0 0 1 17 18H7Z',
  network:
    'M6 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm12 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM12 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM7 6h10M7 6l5 10M17 6l-5 10',
  chart: 'M4 20V10h3v10H4Zm6.5 0V4h3v16h-3ZM17 20v-7h3v7h-3Z',
  generic: 'M5 4.5c2-1 4.7-1 7 0v14.8c-2.3-1-5-1-7 0V4.5ZM19 4.5c-2-1-4.7-1-7 0v14.8c2.3-1 5-1 7 0V4.5Z',
};

export function ExamDetailHeader({
  backTo,
  backLabel,
  title,
  provider,
  description,
  coverImageUrl,
  iconKey,
  favorite,
  metrics,
  progressPct,
  progressLabel,
  accuracy,
}: {
  backTo: string;
  backLabel: string;
  title: string;
  provider: ReactNode;
  description?: string;
  coverImageUrl?: string | null;
  iconKey: CertificationIconKey;
  favorite: { itemType: 'quiz' | 'practiceTest'; itemId: string };
  metrics: SummaryMetric[];
  progressPct: number;
  progressLabel: string;
  accuracy?: { label: string; value: number } | null;
}) {
  return (
    <div className="space-y-5">
      <Link to={backTo} className="inline-block text-sm text-brand-ink hover:underline">
        &larr; {backLabel}
      </Link>

      <div className="flex flex-col gap-4 rounded-xl border border-surface-border bg-surface-raised p-5 shadow-card sm:flex-row">
        {coverImageUrl ? (
          <img
            src={coverImageUrl}
            alt=""
            loading="lazy"
            className="h-28 w-full shrink-0 rounded-lg object-cover sm:h-24 sm:w-40"
          />
        ) : (
          <div
            className={clsx(
              'flex h-28 w-full shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500/15 to-brand-500/5 sm:h-24 sm:w-40',
            )}
          >
            <svg viewBox="0 0 24 24" className="h-10 w-10 text-brand-500" fill="currentColor" aria-hidden="true">
              <path d={FALLBACK_ICON[iconKey] ?? FALLBACK_ICON.generic} />
            </svg>
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{provider}</div>
              <h1 className="mt-0.5 text-[22px] font-extrabold tracking-tight text-ink">{title}</h1>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 text-sm text-ink-muted">
              <WishlistButton itemType={favorite.itemType} itemId={favorite.itemId} variant="inline" />
              <span className="hidden sm:inline">Add to Favorites</span>
            </div>
          </div>
          {description && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">{description}</p>}
        </div>
      </div>

      <ExamSummaryMetrics metrics={metrics} />

      <div className="rounded-xl border border-surface-border bg-surface-raised p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Overall Progress</span>
          {accuracy && (
            <span className="text-sm font-semibold text-ink-muted">
              {accuracy.label} <span className="text-ink">{accuracy.value}%</span>
            </span>
          )}
        </div>
        <ExamProgressBar pct={progressPct} label={progressLabel} className="mt-2" />
      </div>
    </div>
  );
}
