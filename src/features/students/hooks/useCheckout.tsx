import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { checkoutApi } from '../api/cartApi';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { useUiStore } from '@/store/useUiStore';
import { openRazorpayCheckout } from '@/lib/razorpay';
import { VercelApiError } from '@/lib/vercelApi';
import { errorText } from '@/lib/errorMessages';
import { PurchaseConfirmationModal } from '@/components/common/PurchaseConfirmationModal';
import type { PurchasableItemType } from '@/types/models';
import type { CheckoutConsentState } from '../lib/checkoutConsent';

interface CheckoutItem {
  itemType: PurchasableItemType;
  itemId: string;
  title: string;
}

// Shared by CartPage (checkout the whole cart) and every listing page's Buy
// Now button (checkout one specific item directly, bypassing the cart) -
// same Razorpay-open-then-verify flow either way, just a different
// createOrder argument. Also owns the post-payment confirmation modal so
// every caller gets the same clear "you're done, here's what to do next"
// moment for free, rather than each page building its own.
export function useCheckout() {
  const profile = useAuthStore((s) => s.profile);
  const pushToast = useUiStore((s) => s.pushToast);
  const queryClient = useQueryClient();
  const [paying, setPaying] = useState(false);
  const [justPurchased, setJustPurchased] = useState<CheckoutItem[] | null>(null);

  const checkout = async (opts: {
    items: CheckoutItem[];
    consent: CheckoutConsentState;
    buyNowItem?: { itemType: PurchasableItemType; itemId: string };
    couponCode?: string;
    unlockCode?: string;
    useCredit?: boolean;
    referralCode?: string;
  }) => {
    setPaying(true);
    try {
      const order = await checkoutApi.createOrder({
        consent: opts.consent,
        buyNowItem: opts.buyNowItem,
        couponCode: opts.couponCode,
        unlockCode: opts.unlockCode,
        useCredit: opts.useCredit,
        referralCode: opts.referralCode,
      });
      await openRazorpayCheckout({
        keyId: order.keyId,
        amount: order.amount,
        currency: order.currency,
        razorpayOrderId: order.razorpayOrderId,
        name: 'Helpcertify',
        description: opts.items.length === 1 ? opts.items[0].title : `${opts.items.length} items`,
        prefill: { name: profile?.name, email: profile?.email },
        onSuccess: async (response) => {
          try {
            await checkoutApi.verifyPayment({ orderId: order.orderId, ...response });
            setJustPurchased(opts.items);
            queryClient.invalidateQueries({ queryKey: ['student', 'cart'] });
            queryClient.invalidateQueries({ queryKey: ['student', 'purchases'] });
            queryClient.invalidateQueries({ queryKey: ['student', 'certificationCatalog'] });
          } catch {
            pushToast(
              'Payment went through but we could not confirm it here. Refresh in a moment, or contact support if access does not unlock.',
              'error'
            );
          } finally {
            setPaying(false);
          }
        },
        onDismiss: () => setPaying(false),
      });
    } catch (err) {
      setPaying(false);
      const raw = err instanceof VercelApiError ? err.message : '';
      // A coupon complaint is already learner-worded by the API - pass it
      // straight through; everything else goes through the shared mapper.
      pushToast(/coupon/i.test(raw) ? raw : errorText(err, 'Could not start checkout'), 'error');
    }
  };

  const confirmation = justPurchased ? (
    <PurchaseConfirmationModal items={justPurchased} onClose={() => setJustPurchased(null)} />
  ) : null;

  return { checkout, paying, confirmation };
}
