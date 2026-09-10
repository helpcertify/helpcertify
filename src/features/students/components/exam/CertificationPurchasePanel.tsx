import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { cartApi } from '../../api/cartApi';
import { useCheckout } from '../../hooks/useCheckout';
import { pickDefaultPackage } from '../../lib/certificationCatalog';
import type { CatalogCertification, CatalogPackage } from '../../api/certificationCatalogApi';
import { useUiStore } from '@/store/useUiStore';
import { errorText } from '@/lib/errorMessages';
import { formatMoney } from '@/utils/currency';
import { BuyNowModal } from '@/components/common/BuyNowModal';
import { Spinner } from '@/components/common/Spinner';
import { WishlistButton } from '@/components/common/WishlistButton';

// The Udemy-style purchase sidebar for a per-certification detail page:
// price, a compact package selector, Add to cart / Buy now / wishlist, and
// the money-back + access lines. All the cart / checkout / confirmation
// logic is the same as CertificationCard - this is just the vertical,
// sidebar-width presentation of it.
export function CertificationPurchasePanel({
  cert,
  favoriteItemId,
  favoriteItemType,
}: {
  cert: CatalogCertification;
  favoriteItemId: string;
  favoriteItemType: 'practiceTest' | 'quiz';
}) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const { checkout, paying, confirmation } = useCheckout();
  const packages = cert.packages;
  const [selectedId, setSelectedId] = useState<string | null>(() => pickDefaultPackage(packages)?.id ?? null);
  const [buyNowOpen, setBuyNowOpen] = useState(false);

  const selected = packages.find((p) => p.id === selectedId) ?? pickDefaultPackage(packages);

  const addToCart = useMutation({
    mutationFn: (pkg: CatalogPackage) => cartApi.addItem('package', pkg.id),
    onSuccess: (data) => {
      queryClient.setQueryData(['student', 'cart'], data);
      queryClient.invalidateQueries({ queryKey: ['student', 'certificationCatalog'] });
      pushToast('Added to cart', 'success');
    },
    onError: (err) => pushToast(errorText(err, 'Could not add to cart'), 'error'),
  });

  if (packages.length === 0) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface-raised p-5 shadow-card">
        <div className="text-sm font-semibold text-ink">Not on sale yet</div>
        <p className="mt-1 text-sm text-ink-faint">
          Packages for this certification are being prepared. Check back soon.
        </p>
      </div>
    );
  }
  if (!selected) return null;

  const packageTitle = `${cert.name}: ${selected.name}`;
  const savings = selected.originalPrice && selected.originalPrice > selected.price ? selected.originalPrice - selected.price : 0;
  const firstItem = selected.includedItems[0];
  const ownHref = firstItem
    ? firstItem.itemType === 'quiz'
      ? `/home/quizzes/${firstItem.itemId}`
      : `/home/practice-tests/${firstItem.itemId}`
    : '/home/purchases';

  return (
    <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-raised shadow-card">
      <div className="p-5">
        {packages.length > 1 && (
          <div className="mb-4 space-y-2" role="radiogroup" aria-label={`Choose a ${cert.name} package`}>
            {packages.map((pkg) => {
              const isSel = selected.id === pkg.id;
              const badge = pkg.badgeText || (pkg.isRecommended ? 'Best Value' : null);
              return (
                <button
                  key={pkg.id}
                  type="button"
                  role="radio"
                  aria-checked={isSel}
                  onClick={() => setSelectedId(pkg.id)}
                  className={`flex w-full items-start justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                    isSel ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500 dark:bg-brand-500/10' : 'border-surface-border hover:border-brand-500/40'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">{pkg.name}</span>
                    {badge && <span className="text-[11px] font-semibold text-brand-ink">{badge}</span>}
                  </span>
                  <span className="shrink-0 text-sm font-bold text-ink">
                    {pkg.price > 0 ? formatMoney(pkg.price, pkg.currency) : 'Free'}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="text-xs text-ink-faint">Buy {selected.name.toLowerCase()}</div>
        <div className="mt-0.5 flex items-baseline gap-2">
          {selected.originalPrice && selected.originalPrice > selected.price && (
            <span className="text-sm text-ink-faint line-through">{formatMoney(selected.originalPrice, selected.currency)}</span>
          )}
          <span className="text-[26px] font-extrabold tracking-tight text-ink">
            {selected.price > 0 ? formatMoney(selected.price, selected.currency) : 'Free'}
          </span>
        </div>
        {savings > 0 && (
          <div className="mt-1 text-xs font-semibold text-success">
            Save {formatMoney(savings, selected.currency)}
          </div>
        )}

        <ul className="mt-3 space-y-1.5 text-sm text-ink-muted">
          <li className="flex items-center gap-2">
            <span aria-hidden>&#8635;</span>
            <a href="/refund" target="_blank" rel="noopener" className="hover:text-brand-ink hover:underline">
              Refund &amp; cancellation policy
            </a>
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden>&#8734;</span>
            {selected.accessValidityDays > 0 ? `${selected.accessValidityDays} days access` : 'Lifetime access'}
          </li>
        </ul>

        <div className="mt-4 space-y-2">
          {selected.state === 'ACTIVE' ? (
            <Link
              to={ownHref}
              className="block w-full rounded-lg bg-brand-500 py-2.5 text-center text-sm font-semibold text-white hover:bg-brand-600"
            >
              You have this &middot; Go to content
            </Link>
          ) : selected.state === 'IN_CART' ? (
            <Link
              to="/home/cart"
              className="block w-full rounded-lg border border-brand-500 py-2.5 text-center text-sm font-semibold text-brand-ink hover:bg-brand-50"
            >
              &#10003; In cart &middot; View cart
            </Link>
          ) : selected.state === 'COMING_SOON' || selected.state === 'UNAVAILABLE' ? (
            <button
              type="button"
              disabled
              className="w-full rounded-lg border border-surface-border bg-surface-raised py-2.5 text-sm font-semibold text-ink-faint"
            >
              Coming soon
            </button>
          ) : (
            <>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={addToCart.isPending || paying}
                  onClick={() => addToCart.mutate(selected)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
                >
                  {addToCart.isPending ? 'Adding…' : 'Add to cart'}
                </button>
                <span className="flex items-center rounded-lg border border-brand-500/50 px-2">
                  <WishlistButton itemType={favoriteItemType} itemId={favoriteItemId} variant="inline" />
                </span>
              </div>
              <button
                type="button"
                disabled={paying}
                onClick={() => setBuyNowOpen(true)}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-brand-500 py-2.5 text-sm font-semibold text-brand-ink hover:bg-brand-50 disabled:opacity-60"
              >
                {paying && <Spinner className="h-4 w-4" />}
                {paying ? 'Opening…' : 'Buy now'}
              </button>
            </>
          )}
        </div>
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
          onConfirm={(consent, couponCode, useCredit, unlockCode) => {
            checkout({
              buyNowItem: { itemType: 'package', itemId: selected.id },
              items: [{ itemType: 'package', itemId: selected.id, title: packageTitle }],
              consent,
              couponCode,
              useCredit,
              unlockCode,
            });
            setBuyNowOpen(false);
          }}
        />
      )}
      {confirmation}
    </div>
  );
}
