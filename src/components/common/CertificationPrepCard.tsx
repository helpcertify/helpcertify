import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CertificationPlansModal } from './CertificationPlansModal';
import { formatMoney } from '@/utils/currency';
import {
  summarizeCertificationPrep,
  type CatalogCertification,
} from '@/features/students/api/certificationCatalogApi';

// A short, category-tinted icon shown when a certification has no cached
// cover photo yet - never trademarked brand artwork, just a generic shape
// keyed off the certification's own iconKey.
const FALLBACK_ICON: Record<string, string> = {
  shield: 'M12 2 4 5v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V5l-8-3Z',
  cloud: 'M7 18a4.5 4.5 0 0 1-.4-8.98A5.5 5.5 0 0 1 17.3 8 4 4 0 0 1 17 18H7Z',
  network:
    'M6 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm12 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM12 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM7 6h10M7 6l5 10M17 6l-5 10',
  chart: 'M4 20V10h3v10H4Zm6.5 0V4h3v16h-3ZM17 20v-7h3v7h-3Z',
  generic: 'M5 4.5c2-1 4.7-1 7 0v14.8c-2.3-1-5-1-7 0V4.5ZM19 4.5c-2-1-4.7-1-7 0v14.8c2.3-1 5-1 7 0V4.5Z',
};

interface Props {
  certification: CatalogCertification;
}

// One card in the learner home page's "Prepare for Your Certification"
// row. The whole card is clickable (like the course cards) and opens the
// certification's detail page; "View Plans" is a separate control that
// opens the package selector / Buy popup without leaving the page.
export function CertificationPrepCard({ certification }: Props) {
  const [open, setOpen] = useState(false);
  const summary = summarizeCertificationPrep(certification);
  const iconPath = FALLBACK_ICON[certification.iconKey] ?? FALLBACK_ICON.generic;

  const meta: string[] = [];
  if (summary.practiceQuestions > 0) meta.push(`${summary.practiceQuestions.toLocaleString()} practice questions`);
  if (summary.mockExams > 0) meta.push(`${summary.mockExams} mock exam${summary.mockExams === 1 ? '' : 's'}`);
  if (summary.accessDays > 0) meta.push(`${summary.accessDays} days access`);

  // The per-certification detail page, keyed by the batched-content series
  // id. Practice page when there's a question bank, else the mock page.
  const detailHref = certification.seriesId
    ? summary.practiceQuestions > 0
      ? `/home/practice-tests/series/${certification.seriesId}`
      : `/home/mock-exams/series/${certification.seriesId}`
    : null;

  return (
    <div className="relative flex w-60 shrink-0 flex-col overflow-hidden rounded-[14px] border border-surface-border bg-surface-raised shadow-card transition-all duration-150 hover:-translate-y-[3px] hover:border-brand-500/30 hover:shadow-[0_8px_20px_rgba(21,94,239,0.12)] sm:w-72">
      {/* Fixed-height cover - the top ~half of the card, matching the course
          cards' cover so every card on the page keeps the same footprint. */}
      {certification.coverImageUrl ? (
        <div className="h-32 overflow-hidden">
          <img src={certification.coverImageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        </div>
      ) : (
        <div className="flex h-32 items-center justify-center bg-gradient-to-br from-brand-500/15 to-brand-500/5">
          <svg viewBox="0 0 24 24" className="h-12 w-12 text-brand-500" fill="currentColor" aria-hidden="true">
            <path d={iconPath} />
          </svg>
        </div>
      )}

      <div className="flex flex-1 flex-col p-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{certification.provider}</div>
        <h3 className="mt-1 line-clamp-2 text-[15px] font-semibold leading-snug text-ink">{certification.name}</h3>

        {meta.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-xs text-ink-faint">
            {meta.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}

        <div className="mt-2">
          {summary.fromPrice !== null ? (
            <span className="text-sm text-ink-muted">
              From <span className="text-base font-bold text-ink">{formatMoney(summary.fromPrice, summary.currency)}</span>
            </span>
          ) : (
            <span className="text-sm font-semibold text-ink-faint">Coming soon</span>
          )}
        </div>

        {detailHref ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="relative z-10 mt-3 w-full rounded-lg border border-brand-500 bg-surface-raised py-2 text-center text-sm font-semibold text-brand-ink transition-colors hover:bg-brand-50"
          >
            View Plans
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-3 w-full rounded-lg bg-brand-500 py-2 text-center text-sm font-semibold text-white transition-colors hover:bg-brand-600"
          >
            View Plans
          </button>
        )}
      </div>

      {/* Whole-card click target. Rendered last so it sits over the static
          content for click-catching; the "View Plans" button is lifted
          above it with z-10. Only when there is a detail page to go to -
          otherwise the button above is the only action. */}
      {detailHref && (
        <Link to={detailHref} className="absolute inset-0" aria-label={`${certification.name} details`}>
          <span className="sr-only">Open {certification.name}</span>
        </Link>
      )}

      {open && <CertificationPlansModal certification={certification} onClose={() => setOpen(false)} />}
    </div>
  );
}
