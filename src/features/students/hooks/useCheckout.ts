import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { checkoutApi } from '../api/cartApi';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { useUiStore } from '@/store/useUiStore';
import { openRazorpayCheckout } from '@/lib/razorpay';
import { VercelApiError } from '@/lib/vercelApi';
import type { PurchasableItemType } from '@/types/models';

// Shared by CartPage (checkout the whole cart) and the listing pages' Buy
// Now button (checkout one specific item directly, bypassing the cart) —
// same Razorpay-open-then-verify flow either way, just a different
// createOrder argument.
export function useCheckout() {
  const profile = useAuthStore((s) => s.profile);
  const pushToast = useUiStore((s) => s.pushToast);
  const queryClient = useQueryClient();
  const [paying, setPaying] = useState(false);

  const checkout = async (opts: {
    buyNowItem?: { itemType: PurchasableItemType; itemId: string };
    description: string;
    onPaid?: () => void;
  }) => {
    setPaying(true);
    try {
      const order = await checkoutApi.createOrder(opts.buyNowItem);
      await openRazorpayCheckout({
        keyId: order.keyId,
        amount: order.amount,
        currency: order.currency,
        razorpayOrderId: order.razorpayOrderId,
        name: 'Helpcertify',
        description: opts.description,
        prefill: { name: profile?.name, email: profile?.email },
        onSuccess: async (response) => {
          try {
            await checkoutApi.verifyPayment({ orderId: order.orderId, ...response });
            pushToast('Payment successful!', 'success');
            queryClient.invalidateQueries({ queryKey: ['student', 'cart'] });
            queryClient.invalidateQueries({ queryKey: ['student', 'purchases'] });
            opts.onPaid?.();
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
      pushToast(err instanceof VercelApiError ? err.message : 'Could not start checkout', 'error');
    }
  };

  return { checkout, paying };
}
