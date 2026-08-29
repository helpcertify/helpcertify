import { callAction } from '@/lib/vercelApi';

export interface WishlistItemView {
  // Never 'package' — see api/cart.ts's wishlistItemSchema for why.
  itemType: 'quiz' | 'practiceTest';
  itemId: string;
  title: string;
  category: string;
  skillLevel: string;
  price: number;
  originalPrice: number | null;
  currency: 'INR' | 'USD';
  ratingAvg: number;
  ratingCount: number;
  totalQuestions: number;
  // null for a practice test whose admin left session length up to the
  // student instead of fixing one.
  durationMinutes: number | null;
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
  addItem: (itemType: 'quiz' | 'practiceTest', itemId: string) =>
    callAction<{ items: WishlistItemView[] }>('cart', 'addWishlistItem', { itemType, itemId }),
  removeItem: (itemType: 'quiz' | 'practiceTest', itemId: string) =>
    callAction<{ items: WishlistItemView[] }>('cart', 'removeWishlistItem', { itemType, itemId }),
};
