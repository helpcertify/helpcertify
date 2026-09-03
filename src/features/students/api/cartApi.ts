import { callAction } from '@/lib/vercelApi';
import type { PurchasableItemType } from '@/types/models';
import { POLICY_VERSIONS } from '@/features/marketing/policyVersions';
import type { CheckoutConsentState } from '../lib/checkoutConsent';

export interface CartItemView {
  itemType: PurchasableItemType;
  itemId: string;
  title: string;
  price: number;
  originalPrice: number | null;
  currency: 'INR' | 'USD';
  totalQuestions: number;
  // Access period in days for the checkout order summary. 0 / absent =
  // lifetime. Packages carry their own accessValidityDays.
  accessPeriodDays?: number;
}

export interface CartSummary {
  items: CartItemView[];
  couponCode: string | null;
  currency: 'INR' | 'USD';
  subtotal: number;
  discount: number;
  total: number;
}

export const cartApi = {
  getCart: () => callAction<CartSummary>('cart', 'getCart'),
  addItem: (itemType: PurchasableItemType, itemId: string) => callAction<CartSummary>('cart', 'addItem', { itemType, itemId }),
  removeItem: (itemType: PurchasableItemType, itemId: string) =>
    callAction<CartSummary>('cart', 'removeItem', { itemType, itemId }),
  applyCoupon: (code: string) => callAction<CartSummary>('cart', 'applyCoupon', { code }),
  removeCoupon: () => callAction<CartSummary>('cart', 'removeCoupon'),
  listMyPurchases: () =>
    callAction<{
      purchases: { itemType: PurchasableItemType; itemId: string; purchasedAt: unknown; expiresAt?: unknown }[];
    }>(
      'cart',
      'listMyPurchases'
    ),
  listMyOrders: () => callAction<{ orders: MyOrder[] }>('checkout', 'listMyOrders'),
};

export interface CreateOrderResult {
  orderId: string;
  razorpayOrderId: string;
  amount: number;
  currency: string;
  keyId: string;
}

export const checkoutApi = {
  createOrder: (opts: {
    consent: CheckoutConsentState;
    buyNowItem?: { itemType: PurchasableItemType; itemId: string };
    couponCode?: string;
    useCredit?: boolean;
  }) =>
    callAction<CreateOrderResult>('checkout', 'createOrder', {
      ...(opts.buyNowItem ? { buyNowItem: opts.buyNowItem } : {}),
      ...(opts.couponCode ? { couponCode: opts.couponCode } : {}),
      ...(opts.useCredit ? { useCredit: opts.useCredit } : {}),
      consent: {
        ...opts.consent,
        acceptedAt: new Date().toISOString(),
        policyVersions: POLICY_VERSIONS,
      },
    }),
  verifyPayment: (payload: {
    orderId: string;
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => callAction<{ success: true }>('checkout', 'verifyPayment', payload),
};

export interface MyOrder {
  id: string;
  status: 'paid' | 'refunded';
  amount: number;
  currency: string;
  couponCode: string | null;
  razorpayPaymentId: string | null;
  paidAt: unknown;
  createdAt: unknown;
  items: { itemType: string; title: string; accessPeriodLabel: string | null }[];
}
