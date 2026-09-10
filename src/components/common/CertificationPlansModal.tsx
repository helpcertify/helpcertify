import { createPortal } from 'react-dom';
import { ModalCloseButton } from './ModalCloseButton';
import { CertificationCard } from './CertificationCard';
import type { CatalogCertification } from '@/features/students/api/certificationCatalogApi';

// The "View Plans" popup: full certification detail + the package selector
// with Buy / Add to Cart and the post-purchase confirmation, all reused
// as-is from CertificationCard. Rendered through a portal so it is never
// clipped by the card/row that opened it. Shared by CertificationPrepCard
// (learner home) and the redesigned Practice / Mock exam surfaces.
export function CertificationPlansModal({
  certification,
  onClose,
}: {
  certification: CatalogCertification;
  onClose: () => void;
}) {
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="relative my-auto w-full max-w-4xl rounded-2xl border border-surface-border bg-surface-raised p-4 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <ModalCloseButton onClose={onClose} />

        {certification.coverImageUrl && (
          <img src={certification.coverImageUrl} alt="" className="mb-4 h-40 w-full rounded-xl object-cover" />
        )}
        <div className="pr-8 text-xs font-semibold uppercase tracking-wide text-ink-faint">{certification.provider}</div>
        <h2 className="mt-0.5 text-xl font-bold text-ink">{certification.name}</h2>
        {certification.description && (
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">{certification.description}</p>
        )}

        <div className="mt-5">
          <CertificationCard certification={certification} />
        </div>

        {certification.independentPrepDisclaimer && (
          <p className="mt-5 border-t border-surface-border pt-4 text-[11px] leading-relaxed text-ink-faint">
            {certification.independentPrepDisclaimer}
          </p>
        )}
        <a href="/terms" target="_blank" rel="noopener" className="mt-2 block text-xs font-medium text-brand-ink hover:underline">
          Terms &amp; refund policy
        </a>
      </div>
    </div>,
    document.body,
  );
}
