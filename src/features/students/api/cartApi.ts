import { callAction } from '@/lib/vercelApi';
import type { PurchasableItemType } from '@/types/models';

export interface CartItemView {
  itemType: PurchasableItemType;
  itemId: string;
  title: string;
  price: number;
  originalPrice: number | null;
  currency: 'INR' | 'USD';
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
    callAction<{ purchases: { itemType: PurchasableItemType; itemId: string }[] }>('cart', 'listMyPurchases'),
};

export interface CreateOrderResult {
  orderId: string;
  razorpayOrderId: string;
  amount: number;
  currency: string;
  keyId: string;
}

export const checkoutApi = {
  createOrder: (buyNowItem?: { itemType: PurchasableItemType; itemId: string }) =>
    callAction<CreateOrderResult>('checkout', 'createOrder', buyNowItem ? { buyNowItem } : {}),
  verifyPayment: (payload: {
    orderId: string;
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => callAction<{ success: true }>('checkout', 'verifyPayment', payload),
};
