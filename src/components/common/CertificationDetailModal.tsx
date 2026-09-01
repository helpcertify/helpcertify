import { formatMoney } from '@/utils/currency';
import { ModalCloseButton } from './ModalCloseButton';
import { visibleBenefits } from '@/features/admin/lib/packageTemplates';
import type { CatalogCertification, CatalogPackage } from '@/features/students/api/certificationCatalogApi';

interface Props {
  certification: CatalogCertification;
  selectedPackage: CatalogPackage;
  onSelectPackage: (packageId: string) => void;
  onClose: () => void;
}

// "View details" - the full learner-facing breakdown of every package under
// a certification: benefits, price, and the key numbers. getLearnerCatalog
// already returns everything (includedFeatures, practiceQuestionCount,
// mock attempts, access period), so there's no extra backend call. Mirrors
// the admin's "What learners will see" preview.
function summaryLine(pkg: CatalogPackage): string {
  const parts = [`${pkg.accessValidityDays} days access`];
  if (pkg.practiceAccessEnabled && pkg.practiceQuestionCount > 0) {
    parts.push(`${pkg.practiceQuestionCount.toLocaleString()} questions`);
  }
  if (pkg.mockAccessEnabled && pkg.fullMockAttempts > 0) {
    parts.push(`${pkg.fullMockAttempts} mock attempt${pkg.fullMockAttempts === 1 ? '' : 's'}`);
  }
  return parts.join(' · ');
}

export function CertificationDetailModal({ certification, selectedPackage, onSelectPackage, onClose }: Props) {
  const packages = [...certification.packages].sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="relative max-h-[88vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-surface-border bg-surface-raised p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <ModalCloseButton onClose={onClose} />
        <div className="pr-8 text-xs font-semibold uppercase tracking-wide text-ink-faint">{certification.provider}</div>
        <h2 className="mt-0.5 text-xl font-bold text-ink">{certification.name}</h2>
        {certification.description && <p className="mt-2 text-sm text-ink-muted">{certification.description}</p>}

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {packages.map((pkg) => {
            const isSelected = selectedPackage.id === pkg.id;
            return (
              <button
                key={pkg.id}
                type="button"
                onClick={() => onSelectPackage(pkg.id)}
                className={`flex flex-col rounded-xl border p-4 text-left transition-colors ${
                  isSelected
                    ? 'border-[#155EEF] bg-[#EFF6FF] ring-1 ring-[#155EEF] dark:bg-[#155EEF]/10'
                    : 'border-surface-border hover:border-[#B9CEFF]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-bold text-ink">{pkg.name}</span>
                  {pkg.isRecommended && (
                    <span className="rounded-full bg-[#155EEF] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                      Recommended
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  {pkg.originalPrice && pkg.originalPrice > pkg.price && (
                    <span className="text-xs text-ink-faint line-through">{formatMoney(pkg.originalPrice, pkg.currency)}</span>
                  )}
                  <span className="text-lg font-bold text-ink">
                    {pkg.price > 0 ? formatMoney(pkg.price, pkg.currency) : 'Free'}
                  </span>
                </div>
                <ul className="mt-3 flex-1 space-y-1 text-xs text-ink-muted">
                  {visibleBenefits(pkg.includedFeatures).map((f) => (
                    <li key={f}>• {f}</li>
                  ))}
                </ul>
                <div className="mt-3 border-t border-surface-border pt-2 text-[11px] text-ink-faint">{summaryLine(pkg)}</div>
              </button>
            );
          })}
        </div>

        {certification.independentPrepDisclaimer && (
          <p className="mt-5 border-t border-surface-border pt-4 text-[11px] leading-relaxed text-ink-faint">
            {certification.independentPrepDisclaimer}
          </p>
        )}
        <a href="/terms" target="_blank" rel="noopener" className="mt-2 block text-xs font-medium text-[#155EEF] hover:underline">
          Terms &amp; refund policy
        </a>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-lg border border-surface-border py-2 text-sm text-ink-muted hover:border-brand-400"
        >
          Close
        </button>
      </div>
    </div>
  );
}
