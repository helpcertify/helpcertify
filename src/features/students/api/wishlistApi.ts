import { callAction } from '@/lib/vercelApi';
import type { PurchasableItemType } from '@/types/models';

export interface WishlistItemView {
  itemType: PurchasableItemType;
  itemId: string;
  title: string;
  category: string;
  price: number;
  originalPrice: number | null;
  currency: 'INR' | 'USD';
}

// Routed through the 'cart' endpoint (api/cart.ts), not a separate
// 'wishlist' one — Vercel's Hobby plan caps a deployment at 12 Serverless
// Functions, and this repo was already at that limit, so wishlist's backend
// logic was folded into cart.ts instead of shipping a 13th file. The action
// names are namespaced (getWishlist/addWishlistItem/removeWishlistItem) to
// stay distinct from cart's own getCart/addItem/removeItem in that same
// switch statement.
export const wishlistApi = {
  getWishlist: () => callAction<{ items: WishlistItemView[] }>('cart', 'getWishlist'),
  addItem: (itemType: PurchasableItemType, itemId: string) =>
    callAction<{ items: WishlistItemView[] }>('cart', 'addWishlistItem', { itemType, itemId }),
  removeItem: (itemType: PurchasableItemType, itemId: string) =>
    callAction<{ items: WishlistItemView[] }>('cart', 'removeWishlistItem', { itemType, itemId }),
};
