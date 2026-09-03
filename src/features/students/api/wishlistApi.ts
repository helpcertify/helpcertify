import { callAction } from '@/lib/vercelApi';

export interface WishlistItemView {
  // Never 'package' - see api/cart.ts's wishlistItemSchema for why.
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
// 'wishlist' one - originally forced by the pre-Fluid Hobby cap of 12
// Serverless Functions (no longer enforced now the project runs on Fluid
// Compute), but wishlist and cart are one domain regardless. The action
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
