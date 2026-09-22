import { callAction } from '@/lib/vercelApi';
import type { PurchasableItemType } from '@/types/models';
import { POLICY_VERSIONS } from '@/features/marketing/policyVersions';
import type { CheckoutConsentState } from '../lib/checkoutConsent';
import { REF_TOKEN_KEY } from '@/features/partner/hooks/useCaptureReferral';

function readRefToken(): string | undefined {
  try {
    return sessionStorage.getItem(REF_TOKEN_KEY) || undefined;
  } catch {
    return undefined;
  }
}

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
  // Companion one-time code for a coupon that requires one - see
  // CouponDoc.requiresUnlockCode. null on every ordinary coupon.
  unlockCode: string | null;
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
  applyCoupon: (code: string, unlockCode?: string) =>
    callAction<CartSummary>('cart', 'applyCoupon', { code, ...(unlockCode ? { unlockCode } : {}) }),
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

// Gift order details, collected by GiftModal - always paired with a
// buyNowItem (see api/checkout.ts's createOrder: a gift is always one
// specific item for one specific recipient). sendAt absent = send as soon
// as payment clears; a future ISO datetime schedules it for
// processDueGifts to send later instead.
export interface GiftOrderDetails {
  recipientName: string;
  recipientEmail: string;
  sendAt?: string;
  message?: string;
}

export const checkoutApi = {
  createOrder: (opts: {
    consent: CheckoutConsentState;
    buyNowItem?: { itemType: PurchasableItemType | 'creatorProduct' | 'aiCreditPack'; itemId: string; plan?: 'monthly' | 'annual' };
    couponCode?: string;
    unlockCode?: string;
    useCredit?: boolean;
    referralCode?: string;
    giftDetails?: GiftOrderDetails;
  }) =>
    callAction<CreateOrderResult>('checkout', 'createOrder', {
      ...(opts.buyNowItem ? { buyNowItem: opts.buyNowItem } : {}),
      ...(opts.couponCode ? { couponCode: opts.couponCode } : {}),
      ...(opts.unlockCode ? { unlockCode: opts.unlockCode } : {}),
      ...(opts.useCredit ? { useCredit: opts.useCredit } : {}),
      // Partner Commission Framework: forward the opaque signed token
      // captured from a ?ref= link (sessionStorage 'hc:ref') and any code
      // the buyer typed at checkout. Both are re-validated server-side.
      ...(readRefToken() ? { referralToken: readRefToken() } : {}),
      ...(opts.referralCode ? { referralCode: opts.referralCode } : {}),
      ...(opts.giftDetails ? { giftDetails: opts.giftDetails } : {}),
      consent: {
        ...opts.consent,
        acceptedAt: new Date().toISOString(),
        policyVersions: POLICY_VERSIONS,
      },
    }),
  // Public preview of a gift before the recipient signs in - see
  // api/checkout.ts's getGift.
  getGift: (claimCode: string) =>
    callAction<{
      buyerName: string;
      recipientName: string;
      itemTitle: string;
      message: string | null;
      status: 'scheduled' | 'sent' | 'claimed' | 'expired' | 'cancelled';
      expired: boolean;
    }>('checkout', 'getGift', { claimCode }),
  // Authenticated redemption - the signed-in account must match the gift's
  // recipientEmail (see api/checkout.ts's claimGift).
  claimGift: (claimCode: string) =>
    callAction<{ itemType: PurchasableItemType; itemId: string; itemTitle: string }>('checkout', 'claimGift', { claimCode }),
  verifyPayment: (payload: {
    orderId: string;
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => callAction<{ success: true }>('checkout', 'verifyPayment', payload),
  // Read-only coupon check for Buy Now (bypasses the cart, so cartApi's
  // applyCoupon can't be reused): validates the code against this one item
  // and returns the real discounted total, without creating an order.
  previewDiscount: (opts: {
    buyNowItem: { itemType: PurchasableItemType | 'creatorProduct' | 'aiCreditPack'; itemId: string; plan?: 'monthly' | 'annual' };
    couponCode: string;
    unlockCode?: string;
  }) =>
    callAction<PreviewDiscountResult>('checkout', 'previewDiscount', {
      buyNowItem: opts.buyNowItem,
      couponCode: opts.couponCode,
      ...(opts.unlockCode ? { unlockCode: opts.unlockCode } : {}),
    }),
};

export interface PreviewDiscountResult {
  itemTitle: string;
  currency: 'INR' | 'USD';
  subtotal: number;
  discount: number;
  total: number;
}

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
