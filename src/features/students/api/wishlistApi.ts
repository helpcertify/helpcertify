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

export const wishlistApi = {
  getWishlist: () => callAction<{ items: WishlistItemView[] }>('wishlist', 'getWishlist'),
  addItem: (itemType: PurchasableItemType, itemId: string) =>
    callAction<{ items: WishlistItemView[] }>('wishlist', 'addItem', { itemType, itemId }),
  removeItem: (itemType: PurchasableItemType, itemId: string) =>
    callAction<{ items: WishlistItemView[] }>('wishlist', 'removeItem', { itemType, itemId }),
};
