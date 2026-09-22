import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cartApi, type GiftOrderDetails } from '../../api/cartApi';
import { useCheckout } from '../../hooks/useCheckout';
import { pickDefaultPackage } from '../../lib/certificationCatalog';
import type { CatalogCertification, CatalogPackage } from '../../api/certificationCatalogApi';
import { useUiStore } from '@/store/useUiStore';
import { errorText } from '@/lib/errorMessages';
import { formatMoney } from '@/utils/currency';
import { toDate } from '@/utils/formatDate';
import { BuyNowModal } from '@/components/common/BuyNowModal';
import { GiftModal } from '@/components/common/GiftModal';
import { PreviewQuestions } from '@/components/common/PreviewQuestions';
import { ModalCloseButton } from '@/components/common/ModalCloseButton';
import { Spinner } from '@/components/common/Spinner';
import { WishlistButton } from '@/components/common/WishlistButton';
import { ShareIcon, GiftIcon } from '@/components/common/icons';

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
  continueLabel = 'Continue Practice',
  favorite,
  preferredKind,
}: {
  cert: CatalogCertification;
  // Where "Continue Practice" / "Continue" goes for an owner (the first
  // still-unfinished set's take route, decided by the page).
  continueHref: string;
  continueLabel?: string;
  // Shown as "Add to Favorites" in the buy view only (not once owned).
  favorite: { itemType: 'quiz' | 'practiceTest'; itemId: string };
  // Which arrival catalog brought the learner to this detail page
  // (CertificationPracticeDetailPage / CertificationMockDetailPage pass
  // their own kind) - see pickDefaultPackage's own comment for why this
  // matters for the pre-selected plan.
  preferredKind?: 'practice' | 'mock';
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
  const [selectedId, setSelectedId] = useState<string | null>(() => pickDefaultPackage(packages, preferredKind)?.id ?? null);
  const [buyNowOpen, setBuyNowOpen] = useState(false);
  const [giftModalOpen, setGiftModalOpen] = useState(false);
  // Set once GiftModal collects who the gift is for - switches the Buy Now
  // modal that opens right after into gift mode (see its giftRecipientName
  // prop) and gets threaded through to checkout() on confirm.
  const [pendingGift, setPendingGift] = useState<GiftOrderDetails | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const selected = packages.find((p) => p.id === selectedId) ?? pickDefaultPackage(packages, preferredKind);

  const share = async () => {
    const url = window.location.href;
    const shareData = { title: cert.name, text: `Check out ${cert.name} prep on HelpCertify`, url };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
    } catch {
      // User cancelled the native share sheet, or it's not actually
      // supported despite existing - fall through to the clipboard copy.
    }
    try {
      await navigator.clipboard.writeText(url);
      pushToast('Link copied to clipboard', 'success');
    } catch {
      pushToast('Could not copy the link', 'error');
    }
  };

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
    const expiryMs = latestExpiryMs(ownedPackage, purchases?.purchases);
    const daysLeft = expiryMs ? Math.ceil((expiryMs - Date.now()) / 86_400_000) : null;
    const practiceQ = ownedPackage.practiceQuestionCount || ownedPackage.accessibleQuestionCount || ownedPackage.aggregateTotalQuestions;
    const practiceSets = ownedPackage.includedPracticeTestIds.length;
    const includes: string[] = [];
    if (ownedPackage.practiceAccessEnabled && practiceQ > 0) {
      includes.push(
        `${practiceQ.toLocaleString()} practice question${practiceQ === 1 ? '' : 's'}${
          practiceSets > 0 ? ` across ${practiceSets} set${practiceSets === 1 ? '' : 's'}` : ''
        }`,
      );
    }
    if (ownedPackage.mockAccessEnabled && ownedPackage.fullMockAttempts > 0) {
      includes.push(
        `${ownedPackage.fullMockAttempts} full-length mock exam${ownedPackage.fullMockAttempts === 1 ? '' : 's'}${
          ownedPackage.questionsPerMock > 0 ? ` (${ownedPackage.questionsPerMock} questions each)` : ''
        }`,
      );
    }
    // The two lines above already spell out the practice-bank and mock
    // counts, and the Access section below shows the validity window - so
    // drop any admin-authored feature that just restates one of those, and
    // keep only the genuinely additive ones (study plan, analytics,
    // certificates, ...).
    for (const f of ownedPackage.includedFeatures ?? []) {
      const t = f.toLowerCase();
      if (t.includes('practice question')) continue;
      if (t.includes('mock')) continue;
      if (t.includes('access') && /\bdays?\b/.test(t)) continue;
      includes.push(f);
    }

    const upgrade = packages.find(
      (p) =>
        p.state !== 'ACTIVE' &&
        p.state !== 'COMING_SOON' &&
        p.state !== 'UNAVAILABLE' &&
        Number(p.mockAccessEnabled) + Number(p.practiceAccessEnabled) >
          Number(ownedPackage.mockAccessEnabled) + Number(ownedPackage.practiceAccessEnabled),
    );


    return (
      <div className="overflow-hidden rounded-xl border border-brand-500/40 bg-surface-raised shadow-pop">
        <div className="bg-brand-500 px-5 py-4 text-white">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/75">Your plan</div>
          <div className="mt-1 flex items-start justify-between gap-2">
            <span className="text-lg font-extrabold leading-tight">{ownedPackage.name}</span>
            <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-bold">
              &#10003; Active
            </span>
          </div>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">What&rsquo;s included</div>
            <ul className="mt-1.5 space-y-1.5 text-sm text-ink-muted">
              {includes.map((line) => (
                <li key={line} className="flex gap-2">
                  <span className="mt-px shrink-0 text-success">&#10003;</span>
                  <span>{line}</span>
                </li>
              ))}
              {includes.length === 0 && (
                <>
                  {ownedPackage.practiceAccessEnabled && (
                    <li className="flex gap-2">
                      <span className="text-success">&#10003;</span> Practice Questions
                    </li>
                  )}
                  {ownedPackage.mockAccessEnabled && (
                    <li className="flex gap-2">
                      <span className="text-success">&#10003;</span> Mock Exams
                    </li>
                  )}
                </>
              )}
            </ul>
          </div>

          <div className="border-t border-surface-border pt-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">Access</div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm">
              {expiryMs ? (
                <>
                  <span className="text-ink-muted">
                    Until <span className="font-semibold text-ink">{formatAccessDate(expiryMs)}</span>
                  </span>
                  {daysLeft != null && daysLeft > 0 && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                        daysLeft <= 7 ? 'bg-warning-soft text-warning' : 'bg-surface-sunken text-ink-faint'
                      }`}
                    >
                      {daysLeft} day{daysLeft === 1 ? '' : 's'} left
                    </span>
                  )}
                  {daysLeft != null && daysLeft <= 0 && (
                    <span className="rounded-full bg-danger-soft px-1.5 py-0.5 text-[11px] font-semibold text-danger">Expired</span>
                  )}
                </>
              ) : (
                <span className="font-semibold text-ink">Lifetime access</span>
              )}
            </div>
          </div>

          <Link
            to={continueHref}
            className="block w-full rounded-lg bg-brand-500 py-2.5 text-center text-sm font-semibold text-white hover:bg-brand-600"
          >
            {continueLabel}
          </Link>
          <Link
            to="/home/purchases"
            className="block text-center text-xs font-semibold text-brand-ink hover:underline"
          >
            Manage in Billing &amp; Orders
          </Link>

          {upgrade && (
            <div className="rounded-lg border border-surface-border bg-surface-sunken p-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">Upgrade your preparation</div>
              <div className="mt-1 text-sm font-semibold text-ink">{upgrade.name}</div>
              {upgrade.mockAccessEnabled && !ownedPackage.mockAccessEnabled && (
                <div className="text-xs text-ink-faint">Adds full-length mock exams</div>
              )}
              <button
                type="button"
                onClick={() => {
                  setSelectedId(upgrade.id);
                  setUpgradeMode(true);
                }}
                className="mt-2 w-full rounded-lg border border-brand-500 bg-surface-raised py-2 text-sm font-semibold text-brand-ink hover:bg-brand-50"
              >
                View upgrade
              </button>
            </div>
          )}
        </div>
        {confirmation}
      </div>
    );
  }

  // --- Buy / upgrade view -------------------------------------------------
  const packageTitle = `${cert.name}: ${selected.name}`;
  const savings = selected.originalPrice && selected.originalPrice > selected.price ? selected.originalPrice - selected.price : 0;
  const selectable = packages.filter((p) => (upgradeMode ? p.state !== 'ACTIVE' : true));

  // Sample-question count for the Preview modal below. Reuses `favorite`
  // (the representative quiz/practice test set already resolved for the
  // wishlist heart) rather than the certification/package, which has no
  // single question bank of its own. Question text/options aren't gated by
  // purchase at all (see studentContentApi.ts's own comment) - a fixed
  // small sample size here is a business choice ("a few, not the whole
  // bank"), not a security boundary.
  const PREVIEW_QUESTION_COUNT = 3;

  return (
    <div className="overflow-hidden rounded-xl border border-brand-500/40 bg-surface-raised shadow-pop">
      <div className="bg-brand-500 px-5 py-4 text-white">
        <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/75">
          {upgradeMode ? 'Upgrade your plan' : 'Get started'}
        </div>
        <div className="mt-1 text-xl font-extrabold leading-tight sm:text-2xl">Choose your preparation</div>
      </div>

      <div className="p-5">
        {upgradeMode && (
          <button
            type="button"
            onClick={() => setUpgradeMode(false)}
            className="mb-3 text-xs font-semibold text-brand-ink hover:underline"
          >
            &larr; Back to your plan
          </button>
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

        {/* Bigger, bolder price - the main attraction of the card (per the
            product ask), not a line competing for attention with everything
            around it. */}
        <div className="flex items-baseline gap-2.5">
          {selected.originalPrice && selected.originalPrice > selected.price && (
            <span className="text-base text-ink-faint line-through">{formatMoney(selected.originalPrice, selected.currency)}</span>
          )}
          <span className="text-4xl font-extrabold tracking-tight text-ink sm:text-[40px]">
            {selected.price > 0 ? formatMoney(selected.price, selected.currency) : 'Free'}
          </span>
        </div>
        {savings > 0 && (
          <div className="mt-1 text-sm font-semibold text-success">Save {formatMoney(savings, selected.currency)}</div>
        )}

        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-ink hover:underline"
        >
          <span aria-hidden="true">&#9654;</span> Preview sample questions
        </button>

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
              className="block w-full rounded-lg border border-brand-500 py-3 text-center text-[15px] font-semibold text-brand-ink hover:bg-brand-50"
            >
              &#10003; In cart &middot; View cart
            </Link>
          ) : selected.state === 'COMING_SOON' || selected.state === 'UNAVAILABLE' ? (
            <button
              type="button"
              disabled
              className="w-full rounded-lg border border-surface-border py-3 text-[15px] font-semibold text-ink-faint"
            >
              Coming soon
            </button>
          ) : selected.price <= 0 ? (
            // A package can be marked Free (sellingPrice 0) - Add to Cart
            // and Buy Now both make no sense for it (Add to Cart is
            // rejected server-side for a price<=0 item - see api/cart.ts's
            // addItem). Same access-driven button rule as the browse
            // cards: one "Start Free" action straight to the first
            // included item.
            <Link
              to={
                favorite.itemType === 'quiz' ? `/home/quizzes/${favorite.itemId}` : `/home/practice-tests/${favorite.itemId}`
              }
              className="block w-full rounded-lg bg-brand-500 py-3 text-center text-[15px] font-semibold text-white hover:bg-brand-600"
            >
              Start Free
            </Link>
          ) : (
            <>
              <button
                type="button"
                disabled={addToCart.isPending || paying}
                onClick={() => addToCart.mutate(selected)}
                className="w-full rounded-lg bg-brand-500 py-3 text-[15px] font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
              >
                {addToCart.isPending ? 'Adding…' : 'Add to Cart'}
              </button>
              <button
                type="button"
                disabled={paying}
                onClick={() => setBuyNowOpen(true)}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-brand-500 py-3 text-[15px] font-semibold text-brand-ink hover:bg-brand-50 disabled:opacity-60"
              >
                {paying && <Spinner className="h-4 w-4" />}
                {paying ? 'Opening…' : 'Buy Now'}
              </button>
            </>
          )}

          {/* Udemy-style icon row: wishlist, share, gift - equal-weight
              compact buttons rather than one full-width labeled row, so
              they read as secondary to Add to Cart / Buy Now above. */}
          <div className="grid grid-cols-3 gap-2">
            <div className="flex items-center justify-center gap-1.5 rounded-lg border border-surface-border py-2 text-xs font-semibold text-ink-muted">
              <WishlistButton itemType={favorite.itemType} itemId={favorite.itemId} variant="inline" />
              <span>Wishlist</span>
            </div>
            <button
              type="button"
              onClick={share}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-surface-border py-2 text-xs font-semibold text-ink-muted hover:border-brand-500/40 hover:text-ink"
            >
              <ShareIcon className="h-4 w-4" />
              <span>Share</span>
            </button>
            <button
              type="button"
              disabled={selected.state === 'COMING_SOON' || selected.state === 'UNAVAILABLE'}
              onClick={() => setGiftModalOpen(true)}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-surface-border py-2 text-xs font-semibold text-ink-muted hover:border-brand-500/40 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              <GiftIcon className="h-4 w-4" />
              <span>Gift</span>
            </button>
          </div>
        </div>
      </div>

      {previewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setPreviewOpen(false)}>
          <div
            className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-surface-border bg-surface p-1"
            onClick={(e) => e.stopPropagation()}
          >
            <ModalCloseButton onClose={() => setPreviewOpen(false)} />
            <PreviewQuestions
              itemType={favorite.itemType}
              itemId={favorite.itemId}
              previewQuestionCount={PREVIEW_QUESTION_COUNT}
              onBuyNow={() => {
                setPreviewOpen(false);
                setBuyNowOpen(true);
              }}
            />
          </div>
        </div>
      )}

      {giftModalOpen && (
        <GiftModal
          title={packageTitle}
          onClose={() => setGiftModalOpen(false)}
          onContinue={(details) => {
            setPendingGift(details);
            setGiftModalOpen(false);
            setBuyNowOpen(true);
          }}
        />
      )}

      {buyNowOpen && (
        <BuyNowModal
          title={packageTitle}
          price={selected.price}
          originalPrice={selected.originalPrice}
          currency={selected.currency}
          paying={paying}
          buyNowItem={{ itemType: 'package', itemId: selected.id }}
          summaryItem={{ itemType: 'package', accessPeriodDays: selected.accessValidityDays }}
          giftRecipientName={pendingGift?.recipientName}
          onClose={() => {
            setBuyNowOpen(false);
            setPendingGift(null);
          }}
          onConfirm={(consent, couponCode, useCredit, unlockCode) => {
            checkout({
              buyNowItem: { itemType: 'package', itemId: selected.id },
              items: [{ itemType: 'package', itemId: selected.id, title: packageTitle }],
              consent,
              couponCode,
              useCredit,
              unlockCode,
              giftDetails: pendingGift ?? undefined,
            });
            setBuyNowOpen(false);
            setPendingGift(null);
          }}
        />
      )}
      {confirmation}
    </div>
  );
}

function Panel({ children, padded = true }: { children: ReactNode; padded?: boolean }) {
  return (
    <div
      className={`overflow-hidden rounded-xl border border-surface-border-strong bg-surface-raised shadow-pop ${padded ? 'p-5' : ''}`}
    >
      {children}
    </div>
  );
}

// Latest access expiry (epoch ms) across the package's included items the
// learner actually owns. null = lifetime access or unknown.
function latestExpiryMs(
  pkg: CatalogPackage,
  purchases: { itemType: string; itemId: string; expiresAt?: unknown }[] | undefined,
): number | null {
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
  return maxMs;
}

function formatAccessDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
