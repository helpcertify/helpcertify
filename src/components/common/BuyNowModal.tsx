import { useState } from 'react';
import { formatMoney, formatReward } from '@/utils/currency';
import { useMyAvailableCoupons } from '@/features/students/hooks/useMyAvailableCoupons';

interface Props {
  title: string;
  price: number;
  originalPrice: number | null;
  currency: 'INR' | 'USD';
  paying: boolean;
  onClose: () => void;
  onConfirm: (couponCode?: string) => void;
}

// A lightweight confirm-and-pay step for Buy Now, with an optional coupon
// field — previously a coupon could only be applied by going through Add to
// Cart -> Cart page first, which defeated the point of Buy Now being the
// fast, direct path. The actual discounted total shows up in Razorpay's own
// checkout (which always displays the exact amount being charged) rather
// than a second time here, since createOrder is the single source of truth
// for pricing and this dialog doesn't duplicate that computation — an
// invalid code is rejected with a clear error before Razorpay ever opens.
export function BuyNowModal({ title, price, originalPrice, currency, paying, onClose, onConfirm }: Props) {
  const [couponInput, setCouponInput] = useState('');
  const { data: myCoupons } = useMyAvailableCoupons();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl border border-surface-border bg-surface-raised p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-bold text-ink">{title}</h2>
        <div className="mb-5 flex items-center gap-2">
          {originalPrice && originalPrice > price && (
            <span className="text-sm text-ink-faint line-through">{formatMoney(originalPrice, currency)}</span>
          )}
          <span className="text-xl font-bold text-ink">{formatMoney(price, currency)}</span>
        </div>

        {/* Coupons already earned by this account (mainly Refer & Earn
            rewards) — one click fills the code in below, instead of the
            learner needing to go find and retype a code they already
            have. */}
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
        <p className="mb-5 text-xs text-ink-faint">The discounted total (if any) shows on the next, payment screen.</p>

        <button
          type="button"
          disabled={paying}
          onClick={() => onConfirm(couponInput.trim() || undefined)}
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
