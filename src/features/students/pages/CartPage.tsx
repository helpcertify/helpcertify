import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cartApi } from '../api/cartApi';
import { useCheckout } from '../hooks/useCheckout';
import { useMyAvailableCoupons } from '../hooks/useMyAvailableCoupons';
import { useMyCredits } from '../hooks/useMyCredits';
import { useUiStore } from '@/store/useUiStore';
import { formatMoney, formatReward } from '@/utils/currency';
import type { PurchasableItemType } from '@/types/models';
import { OrderSummary } from '../components/OrderSummary';
import { CheckoutConsent } from '../components/CheckoutConsent';
import { EMPTY_CONSENT, allConsentsGiven, type CheckoutConsentState } from '../lib/checkoutConsent';

export function CartPage() {
  const pushToast = useUiStore((s) => s.pushToast);
  const queryClient = useQueryClient();
  const { checkout, paying: payingNow, confirmation } = useCheckout();

  const [couponInput, setCouponInput] = useState('');
  const [useCredit, setUseCredit] = useState(false);
  const [consent, setConsent] = useState<CheckoutConsentState>(EMPTY_CONSENT);

  const { data: cart, isLoading } = useQuery({ queryKey: ['student', 'cart'], queryFn: cartApi.getCart });
  const { data: myCoupons } = useMyAvailableCoupons();
  const { data: credits } = useMyCredits();

  const removeMutation = useMutation({
    mutationFn: (item: { itemType: PurchasableItemType; itemId: string }) => cartApi.removeItem(item.itemType, item.itemId),
    onSuccess: (data) => queryClient.setQueryData(['student', 'cart'], data),
    onError: () => pushToast('Could not remove that item', 'error'),
  });

  const applyCouponMutation = useMutation({
    mutationFn: (code: string) => cartApi.applyCoupon(code),
    onSuccess: (data) => {
      queryClient.setQueryData(['student', 'cart'], data);
      setCouponInput('');
      pushToast('Coupon applied', 'success');
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : 'Could not apply that coupon', 'error'),
  });

  const removeCouponMutation = useMutation({
    mutationFn: () => cartApi.removeCoupon(),
    onSuccess: (data) => queryClient.setQueryData(['student', 'cart'], data),
  });

  const handleCheckout = () => {
    if (!cart || cart.items.length === 0 || !allConsentsGiven(consent)) return;
    checkout({
      items: cart.items.map((i) => ({ itemType: i.itemType, itemId: i.itemId, title: i.title })),
      consent,
      useCredit,
    });
  };

  if (isLoading) return <div className="p-8 text-ink-faint">Loading cart…</div>;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold text-ink">Your Cart</h1>

      {!cart || cart.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-surface-border p-8 text-center">
          <p className="mb-4 text-ink-faint">Your cart is empty.</p>
          <div className="flex justify-center gap-3">
            <Link to="/home/mock-exams" className="rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted">
              Browse Mock Exams
            </Link>
            <Link to="/home/practice-tests" className="rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted">
              Browse Practice Exams
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-6 space-y-3">
            {cart.items.map((item) => (
              <div
                key={`${item.itemType}_${item.itemId}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-surface-border bg-surface-raised p-4"
              >
                <div>
                  <div className="font-medium text-ink">{item.title}</div>
                  <div className="text-xs uppercase tracking-wide text-ink-faint">
                    {item.itemType === 'quiz' ? 'Exam Quiz' : item.itemType === 'practiceTest' ? 'Practice Test' : 'Package'}
                    {item.itemType !== 'package' && ` · ${item.totalQuestions} questions`}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    {item.originalPrice && item.originalPrice > item.price && (
                      <div className="text-xs text-ink-faint line-through">{formatMoney(item.originalPrice, item.currency)}</div>
                    )}
                    <div className="font-semibold text-ink">{formatMoney(item.price, item.currency)}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeMutation.mutate(item)}
                    disabled={removeMutation.isPending}
                    className="text-sm text-ink-faint hover:text-red-400"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-surface-border bg-surface-raised p-5">
            <div className="mb-4">
              <OrderSummary
                items={cart.items.map((i) => ({
                  key: `${i.itemType}_${i.itemId}`,
                  title: i.title,
                  itemType: i.itemType,
                  questionCount: i.itemType === 'package' ? undefined : i.totalQuestions,
                  accessPeriodDays: i.accessPeriodDays,
                  price: i.price,
                  originalPrice: i.originalPrice,
                }))}
                currency={cart.currency}
              />
            </div>

            <div className="mb-4">
              {cart.couponCode ? (
                <div className="flex items-center justify-between rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm">
                  <span className="text-emerald-700 dark:text-emerald-300">Coupon "{cart.couponCode}" applied</span>
                  <button type="button" onClick={() => removeCouponMutation.mutate()} className="text-ink-faint hover:text-ink">
                    Remove
                  </button>
                </div>
              ) : (
                <div>
                  {/* Coupons already earned by this account (mainly Refer &
                      Earn rewards) — one click applies them directly,
                      instead of the learner needing to go find and retype
                      a code they already have. */}
                  {myCoupons && myCoupons.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {myCoupons.map((c) => (
                        <button
                          key={c.code}
                          type="button"
                          disabled={applyCouponMutation.isPending}
                          onClick={() => applyCouponMutation.mutate(c.code)}
                          className="rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-1.5 text-xs font-semibold text-[#155EEF] hover:bg-[#DCEAFF] disabled:opacity-50"
                        >
                          🎁 {c.code} ({formatReward(c.type, c.value)} off)
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value)}
                      placeholder="Enter coupon code"
                      className="input-dark flex-1"
                    />
                    <button
                      type="button"
                      disabled={!couponInput.trim() || applyCouponMutation.isPending}
                      onClick={() => applyCouponMutation.mutate(couponInput.trim())}
                      className="rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted disabled:opacity-50"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              )}
            </div>

            {credits && credits.spendableMinor > 0 && (
              <label className="mb-4 flex items-start gap-2.5 rounded-lg border border-surface-border p-3 text-sm">
                <input type="checkbox" checked={useCredit} onChange={(e) => setUseCredit(e.target.checked)} className="mt-0.5 h-4 w-4" />
                <span>
                  <span className="block font-medium text-ink">
                    Use my {formatMoney(credits.spendableMinor, 'INR')} HelpCertify credit
                  </span>
                  <span className="block text-xs text-ink-faint">
                    Covers part of this order, up to a percentage cap. The exact amount applied shows on the payment screen.
                  </span>
                </span>
              </label>
            )}

            <div className="space-y-1.5 border-t border-surface-border pt-4 text-sm">
              <div className="flex justify-between text-ink-faint">
                <span>Subtotal</span>
                <span>{formatMoney(cart.subtotal, cart.currency)}</span>
              </div>
              {cart.discount > 0 && (
                <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                  <span>Discount</span>
                  <span>-{formatMoney(cart.discount, cart.currency)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-surface-border pt-1.5 text-base font-semibold text-ink">
                <span>Total</span>
                <span>{formatMoney(cart.total, cart.currency)}</span>
              </div>
            </div>

            <div className="mt-4 border-t border-surface-border pt-4">
              <CheckoutConsent value={consent} onChange={setConsent} />
            </div>

            <button
              type="button"
              disabled={payingNow || !allConsentsGiven(consent)}
              onClick={handleCheckout}
              className="mt-5 w-full rounded-lg bg-[#155EEF] py-3 font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {payingNow ? 'Opening payment…' : `Pay ${formatMoney(cart.total, cart.currency)}`}
            </button>
          </div>
        </>
      )}

      {confirmation}
    </div>
  );
}
