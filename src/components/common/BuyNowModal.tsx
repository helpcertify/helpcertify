import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { formatMoney, formatReward } from '@/utils/currency';
import { useMyAvailableCoupons } from '@/features/students/hooks/useMyAvailableCoupons';
import { useMyCredits } from '@/features/students/hooks/useMyCredits';
import { OrderSummary, type OrderSummaryItem } from '@/features/students/components/OrderSummary';
import { CheckoutConsent } from '@/features/students/components/CheckoutConsent';
import { EMPTY_CONSENT, allConsentsGiven, type CheckoutConsentState } from '@/features/students/lib/checkoutConsent';
import { checkoutApi, type PreviewDiscountResult } from '@/features/students/api/cartApi';
import { errorText } from '@/lib/errorMessages';
import type { PurchasableItemType } from '@/types/models';
import { ModalCloseButton } from './ModalCloseButton';
import { Spinner } from './Spinner';

interface Props {
  title: string;
  price: number;
  originalPrice: number | null;
  currency: 'INR' | 'USD';
  paying: boolean;
  // The item this Buy Now is for - needed here (not just at final checkout)
  // so a coupon can be validated and priced against it before payment opens.
  buyNowItem: { itemType: PurchasableItemType | 'creatorProduct' | 'aiCreditPack'; itemId: string; plan?: 'monthly' | 'annual' };
  /** For the order summary: item type, question count, and access period. */
  summaryItem: Omit<OrderSummaryItem, 'key' | 'title' | 'price' | 'originalPrice'>;
  onClose: () => void;
  onConfirm: (consent: CheckoutConsentState, couponCode?: string, useCredit?: boolean, unlockCode?: string) => void;
}

type AppliedCoupon = PreviewDiscountResult & { code: string; unlockCode?: string };

// A confirm-and-pay step for Buy Now: the order summary, the four mandatory
// consent acknowledgements (Pay stays disabled until all are ticked), and a
// coupon field that validates against the real backend (api/checkout.ts's
// previewDiscount) and updates the price shown right here - no more "the
// discount shows on the next screen".
export function BuyNowModal({ title, price, originalPrice, currency, paying, buyNowItem, summaryItem, onClose, onConfirm }: Props) {
  const [couponInput, setCouponInput] = useState('');
  const [applied, setApplied] = useState<AppliedCoupon | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  // A coupon that needs a companion personal code (CouponDoc.requiresUnlockCode)
  // only reveals that second field once it turns out to be needed, instead of
  // always showing a second "coupon-looking" box up front.
  const [needsUnlockCode, setNeedsUnlockCode] = useState(false);
  const [unlockCodeInput, setUnlockCodeInput] = useState('');
  const [showOffers, setShowOffers] = useState(false);
  const [useCredit, setUseCredit] = useState(false);
  const [consent, setConsent] = useState<CheckoutConsentState>(EMPTY_CONSENT);
  const { data: myCoupons } = useMyAvailableCoupons();
  const { data: credits } = useMyCredits();

  const canPay = !paying && allConsentsGiven(consent);

  const previewMutation = useMutation({
    mutationFn: (opts: { code: string; unlockCode?: string }) =>
      checkoutApi.previewDiscount({ buyNowItem, couponCode: opts.code, unlockCode: opts.unlockCode }),
    onSuccess: (data, vars) => {
      setApplied({ ...data, code: vars.code, unlockCode: vars.unlockCode });
      setCouponError(null);
      setNeedsUnlockCode(false);
    },
    onError: (err) => {
      const msg = errorText(err, 'That coupon code could not be applied');
      // Distinguish "needs a second code" from a genuine failure so we only
      // reveal the unlock-code field when it's actually needed.
      if (/personal unlock code/i.test(msg)) {
        setNeedsUnlockCode(true);
        setCouponError(null);
      } else {
        setCouponError(msg);
        setNeedsUnlockCode(false);
      }
    },
  });

  const applyCoupon = (code: string, unlockCode?: string) => {
    const c = code.trim();
    if (!c) return;
    setCouponInput(c);
    previewMutation.mutate({ code: c, unlockCode: unlockCode?.trim() || undefined });
  };

  const removeCoupon = () => {
    setApplied(null);
    setCouponInput('');
    setCouponError(null);
    setNeedsUnlockCode(false);
    setUnlockCodeInput('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="relative max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-surface-border bg-surface-raised p-7 sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <ModalCloseButton onClose={onClose} />
        <h2 className="mb-2 pr-8 text-xl font-bold text-ink">{title}</h2>
        <div className="mb-5 flex flex-wrap items-baseline gap-2.5">
          {applied ? (
            <>
              <span className="text-base text-ink-faint line-through">{formatMoney(price, currency)}</span>
              <span className="text-2xl font-bold text-ink">{formatMoney(applied.total, currency)}</span>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                -{formatMoney(applied.discount, currency)}
              </span>
            </>
          ) : (
            <>
              {originalPrice && originalPrice > price && (
                <span className="text-base text-ink-faint line-through">{formatMoney(originalPrice, currency)}</span>
              )}
              <span className="text-2xl font-bold text-ink">{formatMoney(price, currency)}</span>
            </>
          )}
        </div>

        <OrderSummary
          items={[{ key: 'buynow', title, price, originalPrice, ...summaryItem }]}
          currency={currency}
          total={applied ? applied.total : undefined}
        />

        <p className="mt-4 text-xs leading-relaxed text-ink-faint">
          A free preview is available on the product page to evaluate the question, answer and
          explanation format before you buy.
        </p>

        <div className="my-5 border-t border-surface-border pt-5">
          <CheckoutConsent value={consent} onChange={setConsent} />
        </div>

        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-faint">
          Have a coupon code?
        </label>
        <div className="flex gap-2">
          <input
            value={couponInput}
            onChange={(e) => {
              setCouponInput(e.target.value);
              setCouponError(null);
            }}
            placeholder="Enter coupon code"
            disabled={!!applied || previewMutation.isPending}
            className="input-dark flex-1 disabled:opacity-60"
          />
          {applied ? (
            <button
              type="button"
              onClick={removeCoupon}
              className="shrink-0 rounded-lg border border-red-300 px-4 text-sm font-semibold text-red-500 hover:bg-red-50 dark:border-red-500/40 dark:hover:bg-red-500/10"
            >
              Remove
            </button>
          ) : (
            <button
              type="button"
              disabled={!couponInput.trim() || previewMutation.isPending || needsUnlockCode}
              onClick={() => applyCoupon(couponInput)}
              className="shrink-0 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {previewMutation.isPending ? 'Checking…' : 'Apply'}
            </button>
          )}
        </div>

        {needsUnlockCode && !applied && (
          <div className="mt-2">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-faint">
              This code needs your personal unlock code
            </label>
            <div className="flex gap-2">
              <input
                value={unlockCodeInput}
                onChange={(e) => setUnlockCodeInput(e.target.value)}
                placeholder="Personal unlock code"
                className="input-dark flex-1"
                autoFocus
              />
              <button
                type="button"
                disabled={!unlockCodeInput.trim() || previewMutation.isPending}
                onClick={() => applyCoupon(couponInput, unlockCodeInput)}
                className="shrink-0 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
              >
                {previewMutation.isPending ? 'Checking…' : 'Apply'}
              </button>
            </div>
          </div>
        )}

        {applied ? (
          <p className="mb-3 mt-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            Coupon &quot;{applied.code}&quot; applied - you save {formatMoney(applied.discount, currency)}. New total{' '}
            {formatMoney(applied.total, currency)}.
          </p>
        ) : couponError ? (
          <p className="mb-3 mt-1.5 text-xs font-medium text-red-500">{couponError}</p>
        ) : (
          <p className="mb-3 mt-1.5 text-xs text-ink-faint">Tap Apply to check a code and see the discounted total right here.</p>
        )}

        {/* Coupons already earned by this account (mainly Refer & Earn
            rewards), tucked behind a toggle. One click validates and applies
            the code, same as typing it above. */}
        {myCoupons && myCoupons.length > 0 && !applied && (
          <div className="mb-3">
            <button
              type="button"
              onClick={() => setShowOffers((v) => !v)}
              className="text-xs font-semibold text-brand-ink hover:underline"
            >
              {showOffers ? 'Hide' : 'View'} available offers ({myCoupons.length})
            </button>
            {showOffers && (
              <div className="mt-2 flex flex-wrap gap-2">
                {myCoupons.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    disabled={previewMutation.isPending}
                    onClick={() => applyCoupon(c.code)}
                    className="rounded-full border border-brand-500/30 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-brand-500/10 disabled:opacity-50"
                  >
                    🎁 {c.code} ({formatReward(c.type, c.value)})
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {credits && credits.spendableMinor > 0 && (
          <label className="mb-5 flex items-start gap-2.5 rounded-lg border border-surface-border p-3 text-sm">
            <input type="checkbox" checked={useCredit} onChange={(e) => setUseCredit(e.target.checked)} className="mt-0.5 h-4 w-4" />
            <span>
              <span className="block font-medium text-ink">Use my {formatMoney(credits.spendableMinor, 'INR')} HelpCertify credit</span>
              <span className="block text-xs text-ink-faint">
                Covers part of this order, up to a percentage cap
                {applied ? ' - applied on top of the coupon above at payment' : ''}.
              </span>
            </span>
          </label>
        )}

        <button
          type="button"
          disabled={!canPay}
          onClick={() => onConfirm(consent, applied?.code, useCredit, applied?.unlockCode)}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 py-2.5 font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {paying && <Spinner className="h-4 w-4" />}
          {paying ? 'Opening payment…' : applied ? `Pay ${formatMoney(applied.total, currency)}` : 'Continue to Payment'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full rounded-lg border border-surface-border py-2 text-sm text-ink-muted hover:border-brand-400"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
