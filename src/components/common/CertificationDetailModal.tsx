import { formatMoney } from '@/utils/currency';
import type { CatalogCertification, CatalogPackage } from '@/features/students/api/certificationCatalogApi';

interface Props {
  certification: CatalogCertification;
  selectedPackage: CatalogPackage;
  onSelectPackage: (packageId: string) => void;
  onClose: () => void;
}

// "View Details" (spec section 8) — a lightweight modal rather than a
// separate route, since api/cart.ts's getLearnerCatalog already returns
// everything it needs (denormalized includedItems, aggregate question
// count) with no extra backend call. Reuses BuyNowModal's own modal chrome
// (fixed inset overlay, click-outside-to-close, stopPropagation on the
// panel) for visual consistency with every other purchase dialog.
export function CertificationDetailModal({ certification, selectedPackage, onSelectPackage, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-surface-border bg-surface-raised p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-bold text-ink">{certification.name}</h2>
        <div className="mb-4 text-xs text-ink-faint">{certification.provider}</div>
        {certification.description && <p className="mb-5 text-sm text-ink-muted">{certification.description}</p>}

        <div className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-faint">Packages</div>
        <div className="mb-5 space-y-2">
          {certification.packages.map((pkg) => (
            <button
              key={pkg.id}
              type="button"
              onClick={() => onSelectPackage(pkg.id)}
              className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${
                selectedPackage.id === pkg.id ? 'border-[#155EEF] bg-[#EFF6FF]' : 'border-surface-border hover:border-[#B9CEFF]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-ink">{pkg.name}</span>
                <span className="font-bold text-ink">{pkg.price > 0 ? formatMoney(pkg.price, pkg.currency) : 'Free'}</span>
              </div>
              {pkg.description && <div className="mt-0.5 text-xs text-ink-faint">{pkg.description}</div>}
              <ul className="mt-2 space-y-0.5 text-xs text-ink-muted">
                {pkg.includedItems.map((item) => (
                  <li key={`${item.itemType}_${item.itemId}`}>
                    {item.itemType === 'quiz' ? '📝' : '📚'} {item.title}
                  </li>
                ))}
              </ul>
            </button>
          ))}
        </div>

        <p className="mb-2 text-xs text-ink-faint">
          Purchases are for independent exam preparation only and are not affiliated with, endorsed by, or a
          guarantee of certification from {certification.provider}.
        </p>
        {/* Points at /terms, not /refund — a dedicated refund page only
            exists in this session's parked, uncommitted marketing WIP, and
            this feature must not depend on that landing separately. */}
        <a href="/terms" className="mb-5 block text-xs font-medium text-[#155EEF] hover:underline">
          Terms &amp; refund policy
        </a>

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-lg border border-surface-border py-2 text-sm text-ink-muted hover:border-brand-400"
        >
          Close
        </button>
      </div>
    </div>
  );
}
