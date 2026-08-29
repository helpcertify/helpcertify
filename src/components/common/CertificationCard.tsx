import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { cartApi } from '@/features/students/api/cartApi';
import { useCheckout } from '@/features/students/hooks/useCheckout';
import { useUiStore } from '@/store/useUiStore';
import { BuyNowModal } from './BuyNowModal';
import { CertificationDetailModal } from './CertificationDetailModal';
import { formatMoney } from '@/utils/currency';
import { pickDefaultPackage } from '@/features/students/lib/certificationCatalog';
import type { CatalogCertification, CatalogPackage } from '@/features/students/api/certificationCatalogApi';
import type { CertificationIconKey } from '@/types/models';

const ICON_PATHS: Record<CertificationIconKey, ReactNode> = {
  shield: (
    <path d="M12 2 4 5v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V5l-8-3Z" />
  ),
  cloud: (
    <path d="M7 18a4.5 4.5 0 0 1-.4-8.98A5.5 5.5 0 0 1 17.3 8 4 4 0 0 1 17 18H7Z" />
  ),
  network: (
    <>
      <circle cx="6" cy="6" r="2.4" />
      <circle cx="18" cy="6" r="2.4" />
      <circle cx="12" cy="18" r="2.4" />
      <path d="M7.7 7.6 10.6 16M16.3 7.6 13.4 16M8.4 6h7.2" stroke="currentColor" strokeWidth="1.6" fill="none" />
    </>
  ),
  chart: (
    <path d="M4 20V10h3v10H4Zm6.5 0V4h3v16h-3ZM17 20v-7h3v7h-3Z" />
  ),
  generic: (
    <path
      d="M5 4.5c2-1 4.7-1 7 0v14.8c-2.3-1-5-1-7 0V4.5ZM19 4.5c-2-1-4.7-1-7 0v14.8c2.3-1 5-1 7 0V4.5Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  ),
};

function CertificationIcon({ iconKey }: { iconKey: CertificationIconKey }) {
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#155EEF] text-white">
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
        {ICON_PATHS[iconKey] ?? ICON_PATHS.generic}
      </svg>
    </div>
  );
}

export function CertificationCardSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-4 rounded-[14px] border border-[#DCE7FF] bg-white p-5 lg:flex-row lg:items-start">
      <div className="flex items-start gap-3 lg:w-64 lg:shrink-0">
        <div className="h-12 w-12 shrink-0 rounded-xl bg-[#E8F0FF]" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-32 rounded bg-[#E8F0FF]" />
          <div className="h-3 w-20 rounded bg-[#EFF6FF]" />
        </div>
      </div>
      <div className="flex-1 space-y-3">
        <div className="flex gap-2">
          <div className="h-16 w-28 rounded-lg bg-[#EFF6FF]" />
          <div className="h-16 w-28 rounded-lg bg-[#EFF6FF]" />
          <div className="h-16 w-28 rounded-lg bg-[#EFF6FF]" />
        </div>
        <div className="h-9 w-40 rounded-lg bg-[#E8F0FF]" />
      </div>
    </div>
  );
}

interface CertificationCardProps {
  certification: CatalogCertification;
}

// The certification-level card for "Choose Your Exam Preparation" (and,
// reused as-is, for "My Active Certifications" — pickDefaultPackage already
// prefers an owned/ACTIVE package, so the same component naturally renders
// the right "Continue Learning" state there too). One package is selected
// at a time, kept as local state on this component instance so selecting a
// package on one certification's card never affects any other card.
export function CertificationCard({ certification }: CertificationCardProps) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const { checkout, paying, confirmation } = useCheckout();
  const packages = certification.packages;
  const [selectedId, setSelectedId] = useState<string | null>(() => pickDefaultPackage(packages)?.id ?? null);
  const [buyNowOpen, setBuyNowOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const selected = packages.find((p) => p.id === selectedId) ?? pickDefaultPackage(packages);

  const addToCartMutation = useMutation({
    mutationFn: (pkg: CatalogPackage) => cartApi.addItem('package', pkg.id),
    onSuccess: (data) => {
      queryClient.setQueryData(['student', 'cart'], data);
      queryClient.invalidateQueries({ queryKey: ['student', 'certificationCatalog'] });
      pushToast('Added to cart', 'success');
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : 'Could not add to cart', 'error'),
  });

  // A certification with no published packages yet has nothing to sell —
  // simpler card, no selector row, no wasted layout for an empty row.
  if (packages.length === 0) {
    return (
      <div className="flex flex-col gap-3 rounded-[14px] border border-[#DCE7FF] bg-white p-5 shadow-[0_2px_8px_rgba(15,23,42,0.06)] sm:flex-row sm:items-center">
        <CertificationIcon iconKey={certification.iconKey} />
        <div className="flex-1">
          <h3 className="text-base font-semibold text-[#0F172A]">{certification.name}</h3>
          <p className="line-clamp-2 text-sm text-[#64748B]">
            {certification.description || 'Practice questions and mock exam packages are being prepared.'}
          </p>
        </div>
        <button
          type="button"
          disabled
          className="w-full shrink-0 rounded-lg border border-[#CBD5E1] bg-white py-2 text-sm font-semibold text-[#94A3B8] sm:w-40"
        >
          Coming Soon
        </button>
      </div>
    );
  }

  if (!selected) return null;

  const packageTitle = `${certification.name}: ${selected.name}`;

  const cta = (() => {
    if (selected.state === 'ACTIVE') {
      const firstItem = selected.includedItems[0];
      const href = firstItem
        ? firstItem.itemType === 'quiz'
          ? `/home/quizzes/${firstItem.itemId}`
          : `/home/practice-tests/${firstItem.itemId}`
        : '/home/purchases';
      return (
        <Link
          to={href}
          className="block w-full rounded-lg bg-[#155EEF] py-2 text-center text-sm font-semibold text-white transition-colors hover:bg-[#004EEB]"
        >
          Continue Learning
        </Link>
      );
    }
    if (selected.state === 'IN_CART') {
      return (
        <Link
          to="/home/cart"
          className="block w-full rounded-lg border border-[#155EEF]/50 py-2 text-center text-sm font-semibold text-[#155EEF]"
        >
          ✓ In Cart · View Cart
        </Link>
      );
    }
    if (selected.state === 'COMING_SOON' || selected.state === 'UNAVAILABLE') {
      return (
        <button
          type="button"
          disabled
          className="w-full rounded-lg border border-[#CBD5E1] bg-white py-2 text-sm font-semibold text-[#94A3B8]"
        >
          Coming Soon
        </button>
      );
    }
    return (
      <div className="flex gap-2">
        <button
          type="button"
          disabled={addToCartMutation.isPending || paying}
          onClick={() => addToCartMutation.mutate(selected)}
          className="flex-1 rounded-lg border border-[#CBD5E1] bg-white py-2 text-sm font-semibold text-[#334155] transition-colors hover:border-[#155EEF] hover:bg-[#F8FAFF] hover:text-[#155EEF] disabled:opacity-60"
        >
          {addToCartMutation.isPending ? 'Adding…' : 'Add to Cart'}
        </button>
        <button
          type="button"
          disabled={paying}
          onClick={() => setBuyNowOpen(true)}
          className="flex-1 rounded-lg bg-[#155EEF] py-2 text-sm font-semibold text-white transition-colors hover:bg-[#004EEB] disabled:opacity-60"
        >
          {paying ? 'Opening…' : `Buy for ${formatMoney(selected.price, selected.currency)}`}
        </button>
      </div>
    );
  })();

  return (
    <div className="flex flex-col gap-4 rounded-[14px] border border-[#DCE7FF] bg-white p-5 shadow-[0_2px_8px_rgba(15,23,42,0.06)] transition-all duration-150 hover:border-[#B9CEFF] hover:shadow-[0_8px_20px_rgba(21,94,239,0.12)] lg:flex-row lg:items-start">
      <div className="flex items-start gap-3 lg:w-64 lg:shrink-0">
        <CertificationIcon iconKey={certification.iconKey} />
        <div>
          <button
            type="button"
            onClick={() => setDetailOpen(true)}
            className="text-left text-base font-semibold text-[#0F172A] hover:text-[#155EEF] focus-visible:underline"
          >
            {certification.name}
          </button>
          <div className="text-xs text-[#64748B]">{certification.provider}</div>
          {certification.description && <p className="mt-1 line-clamp-2 text-sm text-[#64748B]">{certification.description}</p>}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div role="radiogroup" aria-label={`Choose a ${certification.name} package`} className="flex flex-wrap gap-2">
          {packages.map((pkg) => {
            const isSelected = selected.id === pkg.id;
            return (
              <button
                key={pkg.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setSelectedId(pkg.id)}
                className={`relative min-w-[120px] flex-1 rounded-lg border px-3 py-2 text-left text-sm transition-colors sm:flex-none ${
                  isSelected ? 'border-[#155EEF] bg-[#EFF6FF] ring-1 ring-[#155EEF]' : 'border-[#DCE7FF] bg-white hover:border-[#B9CEFF]'
                }`}
              >
                {pkg.badgeText && (
                  <span className="absolute -top-2 left-2 rounded-full bg-[#F59E0B] px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                    {pkg.badgeText}
                  </span>
                )}
                <div className="flex items-center gap-1.5 font-semibold text-[#0F172A]">
                  {isSelected && <span aria-hidden="true">✓</span>}
                  {pkg.name}
                </div>
                <div className="flex items-center gap-1.5">
                  {pkg.originalPrice && pkg.originalPrice > pkg.price && (
                    <span className="text-xs text-[#94A3B8] line-through">{formatMoney(pkg.originalPrice, pkg.currency)}</span>
                  )}
                  <span className="font-bold text-[#0F172A]">{pkg.price > 0 ? formatMoney(pkg.price, pkg.currency) : 'Free'}</span>
                </div>
                {pkg.description && <div className="text-xs text-[#64748B]">{pkg.description}</div>}
              </button>
            );
          })}
        </div>

        <div className="mt-3 sm:max-w-xs">{cta}</div>
      </div>

      {buyNowOpen && (
        <BuyNowModal
          title={packageTitle}
          price={selected.price}
          originalPrice={selected.originalPrice}
          currency={selected.currency}
          paying={paying}
          summaryItem={{ itemType: 'package', accessPeriodDays: selected.accessValidityDays }}
          onClose={() => setBuyNowOpen(false)}
          onConfirm={(consent, couponCode, useCredit) => {
            checkout({
              buyNowItem: { itemType: 'package', itemId: selected.id },
              items: [{ itemType: 'package', itemId: selected.id, title: packageTitle }],
              consent,
              couponCode,
              useCredit,
            });
            setBuyNowOpen(false);
          }}
        />
      )}
      {confirmation}

      {detailOpen && (
        <CertificationDetailModal
          certification={certification}
          selectedPackage={selected}
          onSelectPackage={setSelectedId}
          onClose={() => setDetailOpen(false)}
        />
      )}
    </div>
  );
}
