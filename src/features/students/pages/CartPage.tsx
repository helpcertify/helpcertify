import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cartApi, checkoutApi } from '../api/cartApi';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { useUiStore } from '@/store/useUiStore';
import { formatINR } from '@/utils/currency';
import { openRazorpayCheckout } from '@/lib/razorpay';
import { VercelApiError } from '@/lib/vercelApi';

export function CartPage() {
  const profile = useAuthStore((s) => s.profile);
  const pushToast = useUiStore((s) => s.pushToast);
  const queryClient = useQueryClient();

  const [couponInput, setCouponInput] = useState('');
  const [payingNow, setPayingNow] = useState(false);
  const [justPurchased, setJustPurchased] = useState<{ itemType: string; itemId: string; title: string }[] | null>(null);

  const { data: cart, isLoading } = useQuery({ queryKey: ['student', 'cart'], queryFn: cartApi.getCart });

  const invalidateCart = () => queryClient.invalidateQueries({ queryKey: ['student', 'cart'] });

  const removeMutation = useMutation({
    mutationFn: (item: { itemType: 'quiz' | 'practiceTest'; itemId: string }) => cartApi.removeItem(item.itemType, item.itemId),
    onSuccess: (data) => queryClient.setQueryData(['student', 'cart'], data),
    onError: () => pushToast('Could not remove that item', 'error'),
  });

  const applyCouponMutation = useMutation({
    mutationFn: () => cartApi.applyCoupon(couponInput.trim()),
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

  const handleCheckout = async () => {
    if (!cart || cart.items.length === 0) return;
    setPayingNow(true);
    try {
      const order = await checkoutApi.createOrder();
      await openRazorpayCheckout({
        keyId: order.keyId,
        amount: order.amount,
        currency: order.currency,
        razorpayOrderId: order.razorpayOrderId,
        name: 'Helpcertify',
        description: cart.items.length === 1 ? cart.items[0].title : `${cart.items.length} items`,
        prefill: { name: profile?.name, email: profile?.email },
        onSuccess: async (response) => {
          try {
            await checkoutApi.verifyPayment({ orderId: order.orderId, ...response });
            setJustPurchased(cart.items.map((i) => ({ itemType: i.itemType, itemId: i.itemId, title: i.title })));
            invalidateCart();
            pushToast('Payment successful!', 'success');
          } catch {
            pushToast(
              'Payment went through but we could not confirm it here — refresh in a moment, or contact support if access does not unlock.',
              'error'
            );
          } finally {
            setPayingNow(false);
          }
        },
        onDismiss: () => setPayingNow(false),
      });
    } catch (err) {
      setPayingNow(false);
      pushToast(err instanceof VercelApiError ? err.message : 'Could not start checkout', 'error');
    }
  };

  if (justPurchased) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-8 text-center">
          <div className="mb-2 text-3xl">✓</div>
          <h1 className="mb-2 text-xl font-semibold text-white">Payment successful</h1>
          <p className="mb-6 text-sm text-neutral-400">You now have access to:</p>
          <div className="space-y-2 text-left">
            {justPurchased.map((i) => (
              <div key={`${i.itemType}_${i.itemId}`} className="rounded-lg border border-surface-border bg-surface-raised px-4 py-3">
                <div className="font-medium text-white">{i.title}</div>
                <Link
                  to={i.itemType === 'quiz' ? '/home' : '/home/practice-tests'}
                  className="text-sm text-brand-300 hover:underline"
                >
                  Go start it →
                </Link>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) return <div className="p-8 text-neutral-400">Loading cart…</div>;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold text-white">Your Cart</h1>

      {!cart || cart.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-surface-border p-8 text-center">
          <p className="mb-4 text-neutral-400">Your cart is empty.</p>
          <div className="flex justify-center gap-3">
            <Link to="/home" className="rounded-lg border border-surface-border px-4 py-2 text-sm text-neutral-300">
              Browse Quizzes
            </Link>
            <Link to="/home/practice-tests" className="rounded-lg border border-surface-border px-4 py-2 text-sm text-neutral-300">
              Browse Practice Tests
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
                  <div className="font-medium text-white">{item.title}</div>
                  <div className="text-xs uppercase tracking-wide text-neutral-500">
                    {item.itemType === 'quiz' ? 'Exam Quiz' : 'Practice Test'}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    {item.originalPrice && item.originalPrice > item.price && (
                      <div className="text-xs text-neutral-500 line-through">{formatINR(item.originalPrice)}</div>
                    )}
                    <div className="font-semibold text-white">{formatINR(item.price)}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeMutation.mutate(item)}
                    disabled={removeMutation.isPending}
                    className="text-sm text-neutral-500 hover:text-red-400"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-surface-border bg-surface-raised p-5">
            <div className="mb-4">
              {cart.couponCode ? (
                <div className="flex items-center justify-between rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm">
                  <span className="text-emerald-300">Coupon "{cart.couponCode}" applied</span>
                  <button type="button" onClick={() => removeCouponMutation.mutate()} className="text-neutral-400 hover:text-white">
                    Remove
                  </button>
                </div>
              ) : (
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
                    onClick={() => applyCouponMutation.mutate()}
                    className="rounded-lg border border-surface-border px-4 py-2 text-sm text-neutral-300 disabled:opacity-50"
                  >
                    Apply
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-1.5 border-t border-surface-border pt-4 text-sm">
              <div className="flex justify-between text-neutral-400">
                <span>Subtotal</span>
                <span>{formatINR(cart.subtotal)}</span>
              </div>
              {cart.discount > 0 && (
                <div className="flex justify-between text-emerald-400">
                  <span>Discount</span>
                  <span>-{formatINR(cart.discount)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-surface-border pt-1.5 text-base font-semibold text-white">
                <span>Total</span>
                <span>{formatINR(cart.total)}</span>
              </div>
            </div>

            <button
              type="button"
              disabled={payingNow}
              onClick={handleCheckout}
              className="mt-5 w-full rounded-lg bg-blue-600 py-3 font-medium text-white hover:bg-blue-500 disabled:opacity-60"
            >
              {payingNow ? 'Opening payment…' : `Pay ${formatINR(cart.total)}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
