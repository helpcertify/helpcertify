import type { ReactNode } from 'react';
import clsx from 'clsx';
import type { CertificationIconKey } from '@/types/models';
import { WishlistButton } from '@/components/common/WishlistButton';

const FALLBACK_ICON: Record<CertificationIconKey, string> = {
  shield: 'M12 2 4 5v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V5l-8-3Z',
  cloud: 'M7 18a4.5 4.5 0 0 1-.4-8.98A5.5 5.5 0 0 1 17.3 8 4 4 0 0 1 17 18H7Z',
  network:
    'M6 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm12 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM12 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM7 6h10M7 6l5 10M17 6l-5 10',
  chart: 'M4 20V10h3v10H4Zm6.5 0V4h3v16h-3ZM17 20v-7h3v7h-3Z',
  generic: 'M5 4.5c2-1 4.7-1 7 0v14.8c-2.3-1-5-1-7 0V4.5ZM19 4.5c-2-1-4.7-1-7 0v14.8c2.3-1 5-1 7 0V4.5Z',
};

// The compact header card at the top of a per-certification detail page:
// image, provider, title, one-line description, Add to Favorites. Summary
// metrics and progress render below it (separate components), and the
// breadcrumb/back link sits above it on the page.
export function ExamDetailHeader({
  title,
  eyebrow,
  provider,
  description,
  coverImageUrl,
  iconKey,
  favorite,
}: {
  title: string;
  // Small label above the H1, e.g. "Practice Exams" / "Mock Exams".
  eyebrow?: string;
  provider: ReactNode;
  description?: string;
  coverImageUrl?: string | null;
  iconKey: CertificationIconKey;
  favorite: { itemType: 'quiz' | 'practiceTest'; itemId: string };
}) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-surface-border bg-surface-raised p-4 shadow-card sm:flex-row sm:p-5">
      {coverImageUrl ? (
        <img
          src={coverImageUrl}
          alt=""
          loading="lazy"
          className="h-28 w-full shrink-0 rounded-lg object-cover sm:h-24 sm:w-36"
        />
      ) : (
        <div
          className={clsx(
            'flex h-28 w-full shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500/15 to-brand-500/5 sm:h-24 sm:w-36',
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
            <h1 className="mt-0.5 text-xl font-extrabold leading-tight tracking-tight text-ink sm:text-[22px]">{title}</h1>
            {eyebrow && <div className="mt-0.5 text-sm font-semibold text-brand-ink">{eyebrow}</div>}
          </div>
          <div className="flex shrink-0 items-center gap-1 rounded-lg border border-surface-border px-1.5 py-1 text-xs font-semibold text-ink-muted">
            <WishlistButton itemType={favorite.itemType} itemId={favorite.itemId} variant="inline" />
            <span className="hidden pr-1 sm:inline">Add to Favorites</span>
          </div>
        </div>
        {description && <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{description}</p>}
      </div>
    </div>
  );
}
