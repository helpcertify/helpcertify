import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import type { CertificationIconKey } from '@/types/models';
import { WishlistButton } from '@/components/common/WishlistButton';
import { formatMoney } from '@/utils/currency';
import { ExamProgressBar } from './ExamProgressBar';
import { ExamStatusBadge } from './ExamStatusBadge';
import { ExamRowCta } from './ExamRowCta';
import { examCta, type ExamKind, type ExamStatus } from './examCta';

// Category-tinted fallback glyph when a certification has no cached cover
// photo - mirrors CertificationPrepCard's FALLBACK_ICON set.
const FALLBACK_ICON: Record<CertificationIconKey, string> = {
  shield: 'M12 2 4 5v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V5l-8-3Z',
  cloud: 'M7 18a4.5 4.5 0 0 1-.4-8.98A5.5 5.5 0 0 1 17.3 8 4 4 0 0 1 17 18H7Z',
  network:
    'M6 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm12 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM12 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM7 6h10M7 6l5 10M17 6l-5 10',
  chart: 'M4 20V10h3v10H4Zm6.5 0V4h3v16h-3ZM17 20v-7h3v7h-3Z',
  generic: 'M5 4.5c2-1 4.7-1 7 0v14.8c-2.3-1-5-1-7 0V4.5ZM19 4.5c-2-1-4.7-1-7 0v14.8c2.3-1 5-1 7 0V4.5Z',
};

export interface ExamCardModel {
  certId: string;
  seriesId: string;
  name: string;
  provider: string;
  coverImageUrl?: string | null;
  iconKey: CertificationIconKey;
  kind: ExamKind;
  status: ExamStatus;
  totalQuestions: number;
  setCount: number;
  // Practice: unique questions practiced / total. Mock: mocks completed / total.
  progressCurrent: number;
  progressTotal: number;
  progressUnit: string;
  accuracyPct: number | null;
  accuracyLabel: string;
  fromPrice: number | null;
  currency: 'INR' | 'USD';
  // Representative item for the favourite heart - the wishlist is item-level
  // and has no certification row, so the first set/mock stands in for it.
  favoriteItemId: string;
}

function Cover({ model, className }: { model: ExamCardModel; className: string }) {
  if (model.coverImageUrl) {
    return (
      <div className={clsx('overflow-hidden bg-surface-sunken', className)}>
        <img src={model.coverImageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
      </div>
    );
  }
  return (
    <div className={clsx('flex items-center justify-center bg-gradient-to-br from-brand-500/15 to-brand-500/5', className)}>
      <svg viewBox="0 0 24 24" className="h-10 w-10 text-brand-500" fill="currentColor" aria-hidden="true">
        <path d={FALLBACK_ICON[model.iconKey] ?? FALLBACK_ICON.generic} />
      </svg>
    </div>
  );
}

function MetaLine({ model }: { model: ExamCardModel }) {
  const parts: ReactNode[] = [`${model.totalQuestions.toLocaleString()} Questions`];
  if (model.setCount > 0) {
    parts.push(
      model.kind === 'practice'
        ? `${model.setCount} Practice Set${model.setCount === 1 ? '' : 's'}`
        : `${model.setCount} Mock Exam${model.setCount === 1 ? '' : 's'}`,
    );
  }
  return <div className="text-xs text-ink-faint">{parts.join(' · ')}</div>;
}

function ProgressBlock({ model }: { model: ExamCardModel }) {
  if (model.status === 'locked') {
    return (
      <div className="text-xs text-ink-faint">
        {model.fromPrice != null ? (
          <>
            From <span className="font-bold text-ink">{formatMoney(model.fromPrice, model.currency)}</span>
          </>
        ) : (
          'Included with a certification plan'
        )}
      </div>
    );
  }
  const pct = model.progressTotal > 0 ? (model.progressCurrent / model.progressTotal) * 100 : 0;
  return (
    <div className="space-y-1">
      <ExamProgressBar pct={pct} />
      <div className="flex items-center justify-between gap-2 text-xs text-ink-faint">
        <span className="[font-variant-numeric:tabular-nums]">
          {model.progressCurrent.toLocaleString()} / {model.progressTotal.toLocaleString()} {model.progressUnit}
        </span>
        {model.accuracyPct != null && (
          <span className="shrink-0 font-semibold text-ink-muted">
            {model.accuracyLabel}: {model.accuracyPct}%
          </span>
        )}
      </div>
    </div>
  );
}

export function ExamProductCard({
  model,
  detailHref,
  layout = 'grid',
  onViewPlans,
}: {
  model: ExamCardModel;
  detailHref: string;
  layout?: 'grid' | 'list';
  onViewPlans: () => void;
}) {
  const cta = examCta(model.status, model.kind, detailHref);
  const wishlistItemType = model.kind === 'practice' ? 'practiceTest' : 'quiz';

  if (layout === 'list') {
    return (
      <div className="relative flex flex-col gap-4 rounded-xl border border-surface-border bg-surface-raised p-3 shadow-card transition-colors hover:border-brand-500/30 sm:flex-row sm:items-center">
        <Link to={detailHref} className="absolute inset-0 z-0" aria-label={model.name} />
        <Cover model={model} className="h-28 w-full shrink-0 rounded-lg sm:h-24 sm:w-40" />
        <div className="relative z-10 flex min-w-0 flex-1 flex-col justify-center gap-1.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{model.provider}</div>
              <h3 className="truncate text-[15px] font-semibold text-ink">{model.name}</h3>
            </div>
            <ExamStatusBadge status={model.status} className="shrink-0" />
          </div>
          <MetaLine model={model} />
          <ProgressBlock model={model} />
        </div>
        <div className="relative z-10 flex shrink-0 items-center">
          <ExamRowCta cta={cta} onViewPlans={onViewPlans} size="md" />
        </div>
        <WishlistButton
          itemType={wishlistItemType}
          itemId={model.favoriteItemId}
          variant="inline"
          className="absolute right-2 top-2 z-10"
        />
      </div>
    );
  }

  return (
    <div className="relative flex flex-col overflow-hidden rounded-xl border border-surface-border bg-surface-raised shadow-card transition-all duration-150 hover:-translate-y-[2px] hover:border-brand-500/30 hover:shadow-pop">
      <Link to={detailHref} className="absolute inset-0 z-0" aria-label={model.name} />
      <div className="relative">
        <Cover model={model} className="h-32 w-full" />
        <ExamStatusBadge status={model.status} className="absolute left-2 top-2 z-10" />
        <WishlistButton
          itemType={wishlistItemType}
          itemId={model.favoriteItemId}
          variant="overlay"
          className="absolute right-2 top-2 z-10"
        />
      </div>

      <div className="relative z-10 flex flex-1 flex-col gap-2 p-3.5">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{model.provider}</div>
          <h3 className="mt-0.5 line-clamp-2 text-[15px] font-semibold leading-snug text-ink">{model.name}</h3>
        </div>
        <MetaLine model={model} />
        <div className="mt-auto space-y-2.5 pt-1">
          <ProgressBlock model={model} />
          <ExamRowCta cta={cta} onViewPlans={onViewPlans} size="md" fullWidth />
        </div>
      </div>
    </div>
  );
}
