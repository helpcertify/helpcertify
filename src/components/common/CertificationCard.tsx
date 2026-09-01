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
  shield: <path d="M12 2 4 5v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V5l-8-3Z" />,
  cloud: <path d="M7 18a4.5 4.5 0 0 1-.4-8.98A5.5 5.5 0 0 1 17.3 8 4 4 0 0 1 17 18H7Z" />,
  network: (
    <>
      <circle cx="6" cy="6" r="2.4" />
      <circle cx="18" cy="6" r="2.4" />
      <circle cx="12" cy="18" r="2.4" />
      <path d="M7.7 7.6 10.6 16M16.3 7.6 13.4 16M8.4 6h7.2" stroke="currentColor" strokeWidth="1.6" fill="none" />
    </>
  ),
  chart: <path d="M4 20V10h3v10H4Zm6.5 0V4h3v16h-3ZM17 20v-7h3v7h-3Z" />,
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
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#155EEF] text-white">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
        {ICON_PATHS[iconKey] ?? ICON_PATHS.generic}
      </svg>
    </div>
  );
}

// The one key-fact line under a package's price: what the learner actually
// gets. Prefers the concrete entitlement numbers; falls back to the admin's
// free-text description, then the bundle's aggregate question count.
function packageKeyDetail(pkg: CatalogPackage): string {
  const parts: string[] = [];
  // The real published count from the uploaded question docs.
  const questions = pkg.practiceQuestionCount || pkg.aggregateTotalQuestions;
  if (pkg.practiceAccessEnabled && questions > 0) parts.push(`${questions.toLocaleString()} questions`);
  if (pkg.mockAccessEnabled && pkg.fullMockAttempts > 0) {
    parts.push(`${pkg.fullMockAttempts} mock exam${pkg.fullMockAttempts === 1 ? '' : 's'}`);
  }
  if (parts.length > 0) return parts.join(' · ');
  if (pkg.description) return pkg.description;
  if (pkg.aggregateTotalQuestions > 0) return `${pkg.aggregateTotalQuestions.toLocaleString()} questions`;
  return `${pkg.accessValidityDays} days access`;
}

const CARD_SHELL =
  'flex flex-col gap-4 rounded-2xl border border-[#DCE7FF] bg-white p-5 shadow-[0_2px_10px_rgba(15,23,42,0.05)] transition-all duration-150 dark:bg-surface-raised lg:flex-row lg:items-stretch';

export function CertificationCardSkeleton() {
  return (
    <div className={`${CARD_SHELL} animate-pulse`}>
      <div className="flex items-start gap-3 lg:w-72 lg:shrink-0">
        <div className="h-11 w-11 shrink-0 rounded-xl bg-[#E8F0FF]" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-16 rounded bg-[#EFF6FF]" />
          <div className="h-4 w-32 rounded bg-[#E8F0FF]" />
          <div className="h-3 w-24 rounded bg-[#EFF6FF]" />
        </div>
      </div>
      <div className="flex flex-1 gap-2">
        <div className="h-24 flex-1 rounded-xl bg-[#EFF6FF]" />
        <div className="h-24 flex-1 rounded-xl bg-[#EFF6FF]" />
        <div className="hidden h-24 flex-1 rounded-xl bg-[#EFF6FF] sm:block" />
      </div>
      <div className="lg:w-48 lg:shrink-0">
        <div className="h-10 w-full rounded-lg bg-[#E8F0FF]" />
      </div>
    </div>
  );
}

interface CertificationCardProps {
  certification: CatalogCertification;
}

// The certification-level card for "Choose Your Exam Preparation" (and,
// reused as-is, for "My Active Certifications"). Full width: a fixed
// identity column, a flexible package selector that fills the remaining
// space, and a fixed purchase column. One package is selected at a time,
// kept as local state so selecting on one card never affects another.
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

  // Nothing published to sell yet — a compact "Coming Soon" card, no
  // selector row.
  if (packages.length === 0) {
    return (
      <div className="flex flex-col gap-4 rounded-2xl border border-[#DCE7FF] bg-white p-5 shadow-[0_2px_10px_rgba(15,23,42,0.05)] dark:bg-surface-raised sm:flex-row sm:items-center">
        <div className="flex items-start gap-3 sm:flex-1">
          <CertificationIcon iconKey={certification.iconKey} />
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">{certification.provider}</div>
            <h3 className="text-base font-bold text-[#0F172A]">{certification.name}</h3>
            <p className="mt-0.5 text-xs font-medium text-[#94A3B8]">Coming soon</p>
            <p className="mt-1 line-clamp-2 text-sm text-[#64748B]">
              {certification.description || 'Practice questions and mock exam packages are being prepared.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled
          className="shrink-0 rounded-lg border border-[#CBD5E1] bg-white px-4 py-2 text-sm font-semibold text-[#94A3B8] sm:w-40"
        >
          Coming Soon
        </button>
      </div>
    );
  }

  if (!selected) return null;

  const packageTitle = `${certification.name}: ${selected.name}`;
  const savings = selected.originalPrice && selected.originalPrice > selected.price ? selected.originalPrice - selected.price : 0;

  const ctaSubline = (() => {
    if (selected.state === 'ACTIVE') return 'You own this package';
    if (selected.state === 'IN_CART') return `${selected.accessValidityDays} days access`;
    if (selected.state === 'COMING_SOON' || selected.state === 'UNAVAILABLE') return '';
    if (savings > 0) return `Save ${formatMoney(savings, selected.currency)} · ${selected.accessValidityDays} days access`;
    return `${selected.accessValidityDays} days access`;
  })();

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
          className="block w-full rounded-lg bg-[#155EEF] py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-[#004EEB]"
        >
          Continue Learning
        </Link>
      );
    }
    if (selected.state === 'IN_CART') {
      return (
        <Link
          to="/home/cart"
          className="block w-full rounded-lg border border-[#155EEF]/50 py-2.5 text-center text-sm font-semibold text-[#155EEF]"
        >
          ✓ In Cart · View Cart
        </Link>
      );
    }
    if (selected.state === 'COMING_SOON' || selected.state === 'UNAVAILABLE') {
      return (
        <button type="button" disabled className="w-full rounded-lg border border-[#CBD5E1] bg-white py-2.5 text-sm font-semibold text-[#94A3B8]">
          Coming Soon
        </button>
      );
    }
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={paying}
          onClick={() => setBuyNowOpen(true)}
          className="w-full rounded-lg bg-[#155EEF] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#004EEB] disabled:opacity-60"
        >
          {paying ? 'Opening…' : `Buy for ${formatMoney(selected.price, selected.currency)}`}
        </button>
        <button
          type="button"
          disabled={addToCartMutation.isPending || paying}
          onClick={() => addToCartMutation.mutate(selected)}
          className="w-full rounded-lg border border-[#CBD5E1] bg-white py-2 text-sm font-semibold text-[#334155] transition-colors hover:border-[#155EEF] hover:bg-[#F8FAFF] hover:text-[#155EEF] disabled:opacity-60"
        >
          {addToCartMutation.isPending ? 'Adding…' : 'Add to Cart'}
        </button>
      </div>
    );
  })();

  return (
    <div className={`${CARD_SHELL} hover:border-[#B9CEFF] hover:shadow-[0_8px_20px_rgba(21,94,239,0.12)]`}>
      {/* Identity */}
      <div className="flex items-start gap-3 lg:w-72 lg:shrink-0">
        <CertificationIcon iconKey={certification.iconKey} />
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">{certification.provider}</div>
          <button
            type="button"
            onClick={() => setDetailOpen(true)}
            className="block max-w-full text-left text-base font-bold text-[#0F172A] hover:text-[#155EEF] focus-visible:underline dark:text-ink"
          >
            {certification.name}
          </button>
          <div className="mt-0.5 text-xs text-[#64748B]">{selected.accessValidityDays} days access</div>
          {certification.description && (
            <p className="mt-1.5 line-clamp-3 text-xs leading-snug text-[#64748B]">{certification.description}</p>
          )}
          <button
            type="button"
            onClick={() => setDetailOpen(true)}
            className="mt-1.5 text-xs font-semibold text-[#155EEF] hover:underline"
          >
            View details
          </button>
        </div>
      </div>

      {/* Package selector — grows to fill, wraps instead of overflowing */}
      <div
        role="radiogroup"
        aria-label={`Choose a ${certification.name} package`}
        className="flex min-w-0 flex-1 flex-wrap gap-2"
      >
        {packages.map((pkg) => {
          const isSelected = selected.id === pkg.id;
          const badge = pkg.badgeText || (pkg.isRecommended ? 'Best Value' : null);
          return (
            <button
              key={pkg.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => setSelectedId(pkg.id)}
              className={`relative flex flex-1 basis-[8.5rem] flex-col rounded-xl border px-3 pb-2.5 pt-3 text-left transition-colors ${
                isSelected
                  ? 'border-[#155EEF] bg-[#EFF6FF] ring-1 ring-[#155EEF] dark:bg-[#155EEF]/10'
                  : 'border-[#DCE7FF] bg-white hover:border-[#B9CEFF] dark:bg-surface'
              }`}
            >
              {badge && (
                <span className="absolute -top-2 left-3 rounded-full bg-[#F59E0B] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  {badge}
                </span>
              )}
              <span className="flex items-center gap-1 text-sm font-semibold text-[#0F172A] dark:text-ink">
                {isSelected && <span className="text-[10px] leading-none text-[#155EEF]">✓</span>}
                {pkg.name}
              </span>
              <span className="mt-1 flex items-baseline gap-1.5">
                {pkg.originalPrice && pkg.originalPrice > pkg.price && (
                  <span className="text-xs text-[#94A3B8] line-through">{formatMoney(pkg.originalPrice, pkg.currency)}</span>
                )}
                <span className="text-base font-bold text-[#0F172A] dark:text-ink">
                  {pkg.price > 0 ? formatMoney(pkg.price, pkg.currency) : 'Free'}
                </span>
              </span>
              <span className="mt-1 text-[11px] leading-tight text-[#64748B]">{packageKeyDetail(pkg)}</span>
            </button>
          );
        })}
      </div>

      {/* Purchase */}
      <div className="flex flex-col justify-center gap-1.5 lg:w-48 lg:shrink-0">
        {cta}
        {ctaSubline && <p className="text-center text-[11px] text-[#94A3B8]">{ctaSubline}</p>}
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
