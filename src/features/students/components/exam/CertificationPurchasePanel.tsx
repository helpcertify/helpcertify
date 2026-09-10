import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cartApi } from '../../api/cartApi';
import { useCheckout } from '../../hooks/useCheckout';
import { pickDefaultPackage } from '../../lib/certificationCatalog';
import type { CatalogCertification, CatalogPackage } from '../../api/certificationCatalogApi';
import { useUiStore } from '@/store/useUiStore';
import { errorText } from '@/lib/errorMessages';
import { formatMoney } from '@/utils/currency';
import { toDate } from '@/utils/formatDate';
import { BuyNowModal } from '@/components/common/BuyNowModal';
import { Spinner } from '@/components/common/Spinner';

// The purchase / access card for a per-certification detail page. Owns
// nothing new: same cart / useCheckout / BuyNowModal flow as
// CertificationCard, and the same PackageDoc.state the learner catalog
// already resolves server-side. Three shapes:
//   - not owned  -> "Choose your preparation": plan selector + price + Buy
//   - owned      -> "Your plan": active summary + Continue + upgrade hint
//   - upgrading  -> owned, but the learner tapped "View upgrade" -> buy the
//                   more inclusive plan (no duplicate entitlement logic;
//                   the batched items they already own just are not charged)
export function CertificationPurchasePanel({
  cert,
  continueHref,
}: {
  cert: CatalogCertification;
  // Where "Continue Practice" / "Continue" goes for an owner (the first
  // still-unfinished set's take route, decided by the page).
  continueHref: string;
}) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const { checkout, paying, confirmation } = useCheckout();
  const packages = cert.packages;

  const { data: purchases } = useQuery({ queryKey: ['student', 'purchases'], queryFn: cartApi.listMyPurchases });

  // The most inclusive package the learner already owns (Complete over a
  // single-track plan), if any.
  const ownedPackage = useMemo(() => {
    const active = packages.filter((p) => p.state === 'ACTIVE');
    if (active.length === 0) return null;
    return [...active].sort((a, b) => Number(b.mockAccessEnabled) + Number(b.practiceAccessEnabled) - (Number(a.mockAccessEnabled) + Number(a.practiceAccessEnabled)))[0];
  }, [packages]);

  const [upgradeMode, setUpgradeMode] = useState(false);
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
      <Panel>
        <div className="text-sm font-semibold text-ink">Not on sale yet</div>
        <p className="mt-1 text-sm text-ink-faint">Packages for this certification are being prepared. Check back soon.</p>
      </Panel>
    );
  }
  if (!selected) return null;

  // --- Owned view ----------------------------------------------------------
  if (ownedPackage && !upgradeMode) {
    const accessUntil = latestExpiry(ownedPackage, purchases?.purchases);
    const upgrade = packages.find(
      (p) =>
        p.state !== 'ACTIVE' &&
        p.state !== 'COMING_SOON' &&
        p.state !== 'UNAVAILABLE' &&
        Number(p.mockAccessEnabled) + Number(p.practiceAccessEnabled) >
          Number(ownedPackage.mockAccessEnabled) + Number(ownedPackage.practiceAccessEnabled),
    );
    return (
      <Panel>
        <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">Your plan</div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-base font-bold text-ink">{ownedPackage.name}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-bold text-success">
            &#10003; Active
          </span>
        </div>

        <ul className="mt-3 space-y-1.5 text-sm text-ink-muted">
          {ownedPackage.practiceAccessEnabled && (
            <li className="flex items-center gap-2">
              <span className="text-success">&#10003;</span> Practice Questions
            </li>
          )}
          {ownedPackage.mockAccessEnabled && (
            <li className="flex items-center gap-2">
              <span className="text-success">&#10003;</span> Mock Exams
            </li>
          )}
          <li className="pt-1 text-xs text-ink-faint">
            {accessUntil ? `Access until ${accessUntil}` : 'Lifetime access'}
          </li>
        </ul>

        <Link
          to={continueHref}
          className="mt-4 block w-full rounded-lg bg-brand-500 py-2.5 text-center text-sm font-semibold text-white hover:bg-brand-600"
        >
          Continue Practice
        </Link>

        {upgrade && (
          <div className="mt-4 border-t border-surface-border pt-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">Upgrade your preparation</div>
            <div className="mt-1 text-sm font-semibold text-ink">{upgrade.name}</div>
            {upgrade.mockAccessEnabled && !ownedPackage.mockAccessEnabled && (
              <div className="text-xs text-ink-faint">Adds Mock Exams</div>
            )}
            <button
              type="button"
              onClick={() => {
                setSelectedId(upgrade.id);
                setUpgradeMode(true);
              }}
              className="mt-2 w-full rounded-lg border border-brand-500 py-2 text-sm font-semibold text-brand-ink hover:bg-brand-50"
            >
              View upgrade
            </button>
          </div>
        )}
        {confirmation}
      </Panel>
    );
  }

  // --- Buy / upgrade view -------------------------------------------------
  const packageTitle = `${cert.name}: ${selected.name}`;
  const savings = selected.originalPrice && selected.originalPrice > selected.price ? selected.originalPrice - selected.price : 0;
  const selectable = packages.filter((p) => (upgradeMode ? p.state !== 'ACTIVE' : true));

  return (
    <Panel padded={false}>
      <div className="p-5">
        {upgradeMode ? (
          <button
            type="button"
            onClick={() => setUpgradeMode(false)}
            className="mb-3 text-xs font-semibold text-brand-ink hover:underline"
          >
            &larr; Back to your plan
          </button>
        ) : (
          <div className="mb-3 text-sm font-bold text-ink">Choose your preparation</div>
        )}

        {selectable.length > 1 && (
          <div className="mb-4 space-y-2" role="radiogroup" aria-label={`Choose a ${cert.name} package`}>
            {selectable.map((pkg) => {
              const isSel = selected.id === pkg.id;
              const badge = pkg.badgeText || (pkg.isRecommended ? 'Best Value' : null);
              return (
                <button
                  key={pkg.id}
                  type="button"
                  role="radio"
                  aria-checked={isSel}
                  onClick={() => setSelectedId(pkg.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                    isSel
                      ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500 dark:bg-brand-500/10'
                      : 'border-surface-border hover:border-brand-500/40'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">{pkg.name}</span>
                    {badge && <span className="text-[11px] font-semibold text-brand-ink">{badge}</span>}
                  </span>
                  <span className="shrink-0 text-sm font-bold text-ink [font-variant-numeric:tabular-nums]">
                    {pkg.price > 0 ? formatMoney(pkg.price, pkg.currency) : 'Free'}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-baseline gap-2">
          {selected.originalPrice && selected.originalPrice > selected.price && (
            <span className="text-sm text-ink-faint line-through">{formatMoney(selected.originalPrice, selected.currency)}</span>
          )}
          <span className="text-[26px] font-extrabold tracking-tight text-ink">
            {selected.price > 0 ? formatMoney(selected.price, selected.currency) : 'Free'}
          </span>
        </div>
        {savings > 0 && (
          <div className="mt-1 text-xs font-semibold text-success">Save {formatMoney(savings, selected.currency)}</div>
        )}

        <ul className="mt-3 space-y-1.5 text-sm text-ink-muted">
          <li>
            <a href="/refund" target="_blank" rel="noopener" className="hover:text-brand-ink hover:underline">
              Refund &amp; cancellation policy
            </a>
          </li>
          <li className="text-xs text-ink-faint">
            {selected.accessValidityDays > 0 ? `${selected.accessValidityDays} days access` : 'Lifetime access'}
          </li>
        </ul>

        <div className="mt-4 space-y-2">
          {selected.state === 'IN_CART' ? (
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
              className="w-full rounded-lg border border-surface-border py-2.5 text-sm font-semibold text-ink-faint"
            >
              Coming soon
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={addToCart.isPending || paying}
                onClick={() => addToCart.mutate(selected)}
                className="w-full rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
              >
                {addToCart.isPending ? 'Adding…' : 'Add to Cart'}
              </button>
              <button
                type="button"
                disabled={paying}
                onClick={() => setBuyNowOpen(true)}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-brand-500 py-2.5 text-sm font-semibold text-brand-ink hover:bg-brand-50 disabled:opacity-60"
              >
                {paying && <Spinner className="h-4 w-4" />}
                {paying ? 'Opening…' : 'Buy Now'}
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
    </Panel>
  );
}

function Panel({ children, padded = true }: { children: ReactNode; padded?: boolean }) {
  return (
    <div
      className={`overflow-hidden rounded-xl border border-surface-border bg-surface-raised shadow-card ${padded ? 'p-5' : ''}`}
    >
      {children}
    </div>
  );
}

// Latest access expiry across the package's included items the learner
// actually owns. Returns a formatted date, or null for lifetime / unknown.
function latestExpiry(
  pkg: CatalogPackage,
  purchases: { itemType: string; itemId: string; expiresAt?: unknown }[] | undefined,
): string | null {
  if (!purchases?.length) return null;
  const keys = new Set(pkg.includedItems.map((i) => `${i.itemType}_${i.itemId}`));
  let maxMs = 0;
  let sawLifetime = false;
  for (const p of purchases) {
    if (!keys.has(`${p.itemType}_${p.itemId}`)) continue;
    if (!p.expiresAt) {
      sawLifetime = true;
      continue;
    }
    maxMs = Math.max(maxMs, toDate(p.expiresAt).getTime());
  }
  if (sawLifetime || maxMs === 0) return null;
  return new Date(maxMs).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
