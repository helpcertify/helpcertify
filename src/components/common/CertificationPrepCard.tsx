import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ModalCloseButton } from './ModalCloseButton';
import { CertificationCard } from './CertificationCard';
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
// row. Same fixed footprint as the course cards in "Courses to explore" /
// "New courses" (compact ProductCardShell: w-60 / sm:w-72, h-24 cover) so
// every card on the home page reads as the same size. "View Plans" opens a
// full-detail popup with the package selector + Buy / Add to Cart and the
// post-purchase confirmation, all reused from CertificationCard.
export function CertificationPrepCard({ certification }: Props) {
  const [open, setOpen] = useState(false);
  const summary = summarizeCertificationPrep(certification);
  const iconPath = FALLBACK_ICON[certification.iconKey] ?? FALLBACK_ICON.generic;

  const meta: string[] = [];
  if (summary.practiceQuestions > 0) meta.push(`${summary.practiceQuestions.toLocaleString()} practice questions`);
  if (summary.mockExams > 0) meta.push(`${summary.mockExams} mock exam${summary.mockExams === 1 ? '' : 's'}`);
  if (summary.accessDays > 0) meta.push(`${summary.accessDays} days access`);

  return (
    <div className="flex w-60 shrink-0 flex-col overflow-hidden rounded-[14px] border border-surface-border bg-surface-raised shadow-card transition-all duration-150 hover:-translate-y-[3px] hover:border-brand-500/30 hover:shadow-[0_8px_20px_rgba(21,94,239,0.12)] sm:w-72">
      {/* Fixed-height cover - the top ~half of the card, matching the course
          cards' cover so every card on the page keeps the same footprint. */}
      {certification.coverImageUrl ? (
        <div className="h-32 overflow-hidden">
          <img
            src={certification.coverImageUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
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

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 w-full rounded-lg bg-brand-500 py-2 text-center text-sm font-semibold text-white transition-colors hover:bg-brand-600"
        >
          View Plans
        </button>
      </div>

      {open && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative my-auto w-full max-w-4xl rounded-2xl border border-surface-border bg-surface-raised p-4 sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <ModalCloseButton onClose={() => setOpen(false)} />

            {certification.coverImageUrl && (
              <img
                src={certification.coverImageUrl}
                alt=""
                className="mb-4 h-40 w-full rounded-xl object-cover"
              />
            )}
            <div className="pr-8 text-xs font-semibold uppercase tracking-wide text-ink-faint">
              {certification.provider}
            </div>
            <h2 className="mt-0.5 text-xl font-bold text-ink">{certification.name}</h2>
            {certification.description && (
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">{certification.description}</p>
            )}

            {/* Package selector + Buy / Add to Cart + post-purchase
                confirmation - reused as-is from the certification card. */}
            <div className="mt-5">
              <CertificationCard certification={certification} />
            </div>

            {certification.independentPrepDisclaimer && (
              <p className="mt-5 border-t border-surface-border pt-4 text-[11px] leading-relaxed text-ink-faint">
                {certification.independentPrepDisclaimer}
              </p>
            )}
            <a
              href="/terms"
              target="_blank"
              rel="noopener"
              className="mt-2 block text-xs font-medium text-brand-ink hover:underline"
            >
              Terms &amp; refund policy
            </a>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
