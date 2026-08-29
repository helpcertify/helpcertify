import { useState } from 'react';
import { formatMoney, formatReward } from '@/utils/currency';
import { useMyAvailableCoupons } from '@/features/students/hooks/useMyAvailableCoupons';
import { useMyCredits } from '@/features/students/hooks/useMyCredits';
import { OrderSummary, type OrderSummaryItem } from '@/features/students/components/OrderSummary';
import { CheckoutConsent } from '@/features/students/components/CheckoutConsent';
import { EMPTY_CONSENT, allConsentsGiven, type CheckoutConsentState } from '@/features/students/lib/checkoutConsent';

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
// own checkout — createOrder is the single source of truth for pricing and
// for re-checking consent server-side.
export function BuyNowModal({ title, price, originalPrice, currency, paying, summaryItem, onClose, onConfirm }: Props) {
  const [couponInput, setCouponInput] = useState('');
  const [useCredit, setUseCredit] = useState(false);
  const [consent, setConsent] = useState<CheckoutConsentState>(EMPTY_CONSENT);
  const { data: myCoupons } = useMyAvailableCoupons();
  const { data: credits } = useMyCredits();

  const canPay = !paying && allConsentsGiven(consent);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-surface-border bg-surface-raised p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-bold text-ink">{title}</h2>
        <div className="mb-4 flex items-center gap-2">
          {originalPrice && originalPrice > price && (
            <span className="text-sm text-ink-faint line-through">{formatMoney(originalPrice, currency)}</span>
          )}
          <span className="text-xl font-bold text-ink">{formatMoney(price, currency)}</span>
        </div>

        <OrderSummary
          items={[{ key: 'buynow', title, price, originalPrice, ...summaryItem }]}
          currency={currency}
        />

        <p className="mt-3 text-xs text-ink-faint">
          A free preview is available on the product page to evaluate the question, answer and
          explanation format before you buy.
        </p>

        <div className="my-4 border-t border-surface-border pt-4">
          <CheckoutConsent value={consent} onChange={setConsent} />
        </div>

        {/* Coupons already earned by this account (mainly Refer & Earn
            rewards) — one click fills the code in below. */}
        {myCoupons && myCoupons.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {myCoupons.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => setCouponInput(c.code)}
                className="rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-1.5 text-xs font-semibold text-[#155EEF] hover:bg-[#DCEAFF]"
              >
                🎁 {c.code} ({formatReward(c.type, c.value)} off)
              </button>
            ))}
          </div>
        )}

        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-faint">
          Have a coupon code?
        </label>
        <input
          value={couponInput}
          onChange={(e) => setCouponInput(e.target.value)}
          placeholder="Optional"
          className="input-dark mb-1"
        />
        <p className="mb-3 text-xs text-ink-faint">The discounted total (if any) shows on the next, payment screen.</p>

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
          onClick={() => onConfirm(consent, couponInput.trim() || undefined, useCredit)}
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
