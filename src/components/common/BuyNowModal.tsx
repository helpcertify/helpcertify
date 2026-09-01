import { useState } from 'react';
import { formatMoney, formatReward } from '@/utils/currency';
import { useMyAvailableCoupons } from '@/features/students/hooks/useMyAvailableCoupons';
import { useMyCredits } from '@/features/students/hooks/useMyCredits';
import { OrderSummary, type OrderSummaryItem } from '@/features/students/components/OrderSummary';
import { CheckoutConsent } from '@/features/students/components/CheckoutConsent';
import { EMPTY_CONSENT, allConsentsGiven, type CheckoutConsentState } from '@/features/students/lib/checkoutConsent';
import { ModalCloseButton } from './ModalCloseButton';

interface Props {
  title: string;
  price: number;
  originalPrice: number | null;
  currency: 'INR' | 'USD';
  paying: boolean;
  /** For the order summary: item type, question count, and access period. */
  summaryItem: Omit<OrderSummaryItem, 'key' | 'title' | 'price' | 'originalPrice'>;
  onClose: () => void;
  onConfirm: (consent: CheckoutConsentState, couponCode?: string, useCredit?: boolean) => void;
}

// A confirm-and-pay step for Buy Now: the order summary, the four mandatory
// consent acknowledgements (Pay stays disabled until all are ticked), plus an
// optional coupon field. The actual discounted total shows up in Razorpay's
// own checkout - createOrder is the single source of truth for pricing and
// for re-checking consent server-side.
export function BuyNowModal({ title, price, originalPrice, currency, paying, summaryItem, onClose, onConfirm }: Props) {
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [showOffers, setShowOffers] = useState(false);
  const [useCredit, setUseCredit] = useState(false);
  const [consent, setConsent] = useState<CheckoutConsentState>(EMPTY_CONSENT);
  const { data: myCoupons } = useMyAvailableCoupons();
  const { data: credits } = useMyCredits();

  const canPay = !paying && allConsentsGiven(consent);
  const applyCoupon = (code: string) => {
    const c = code.trim();
    if (!c) return;
    setAppliedCoupon(c);
    setCouponInput(c);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="relative max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-surface-border bg-surface-raised p-7 sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <ModalCloseButton onClose={onClose} />
        <h2 className="mb-2 pr-8 text-xl font-bold text-ink">{title}</h2>
        <div className="mb-5 flex items-baseline gap-2.5">
          {originalPrice && originalPrice > price && (
            <span className="text-base text-ink-faint line-through">{formatMoney(originalPrice, currency)}</span>
          )}
          <span className="text-2xl font-bold text-ink">{formatMoney(price, currency)}</span>
        </div>

        <OrderSummary
          items={[{ key: 'buynow', title, price, originalPrice, ...summaryItem }]}
          currency={currency}
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
            onChange={(e) => setCouponInput(e.target.value)}
            placeholder="Optional"
            disabled={!!appliedCoupon}
            className="input-dark flex-1 disabled:opacity-60"
          />
          {appliedCoupon ? (
            <button
              type="button"
              onClick={() => {
                setAppliedCoupon(null);
                setCouponInput('');
              }}
              className="shrink-0 rounded-lg border border-red-300 px-4 text-sm font-semibold text-red-500 hover:bg-red-50 dark:border-red-500/40 dark:hover:bg-red-500/10"
            >
              Remove
            </button>
          ) : (
            <button
              type="button"
              disabled={!couponInput.trim()}
              onClick={() => applyCoupon(couponInput)}
              className="shrink-0 rounded-lg bg-[#155EEF] px-4 text-sm font-semibold text-white hover:bg-[#004EEB] disabled:opacity-50"
            >
              Apply
            </button>
          )}
        </div>
        {appliedCoupon ? (
          <p className="mb-3 mt-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            Coupon &quot;{appliedCoupon}&quot; applied. The final total shows on the next payment screen.
          </p>
        ) : (
          <p className="mb-3 mt-1 text-xs text-ink-faint">
            The discounted total, if any, shows on the next payment screen.
          </p>
        )}

        {/* Coupons already earned by this account (mainly Refer & Earn
            rewards), tucked behind a toggle. One click applies the code. */}
        {myCoupons && myCoupons.length > 0 && (
          <div className="mb-3">
            <button
              type="button"
              onClick={() => setShowOffers((v) => !v)}
              className="text-xs font-semibold text-[#155EEF] hover:underline"
            >
              {showOffers ? 'Hide' : 'View'} available offers ({myCoupons.length})
            </button>
            {showOffers && (
              <div className="mt-2 flex flex-wrap gap-2">
                {myCoupons.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => applyCoupon(c.code)}
                    className="rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-1.5 text-xs font-semibold text-[#155EEF] hover:bg-[#DCEAFF]"
                  >
                    🎁 {c.code} ({formatReward(c.type, c.value)} off)
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
              <span className="block text-xs text-ink-faint">Covers part of this order, up to a percentage cap.</span>
            </span>
          </label>
        )}

        <button
          type="button"
          disabled={!canPay}
          onClick={() => onConfirm(consent, appliedCoupon ?? (couponInput.trim() || undefined), useCredit)}
          className="w-full rounded-lg bg-[#155EEF] py-2.5 font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {paying ? 'Opening payment…' : 'Continue to Payment'}
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
