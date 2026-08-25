import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { wishlistApi, type WishlistItemView } from '../api/wishlistApi';
import { cartApi } from '../api/cartApi';
import { useCheckout } from '../hooks/useCheckout';
import { useUiStore } from '@/store/useUiStore';
import { formatMoney } from '@/utils/currency';
import { BuyNowModal } from '@/components/common/BuyNowModal';
import { WishlistButton } from '@/components/common/WishlistButton';

export function WishlistPage() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const { checkout, paying, confirmation } = useCheckout();
  const { data: wishlist } = useQuery({ queryKey: ['student', 'wishlist'], queryFn: wishlistApi.getWishlist });
  const { data: cart } = useQuery({ queryKey: ['student', 'cart'], queryFn: cartApi.getCart });
  const [buyNowItem, setBuyNowItem] = useState<WishlistItemView | null>(null);

  const inCartSet = new Set((cart?.items ?? []).map((i) => `${i.itemType}_${i.itemId}`));

  const addToCartMutation = useMutation({
    mutationFn: (item: WishlistItemView) => cartApi.addItem(item.itemType, item.itemId),
    onSuccess: (data) => {
      queryClient.setQueryData(['student', 'cart'], data);
      pushToast('Added to cart', 'success');
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : 'Could not add to cart', 'error'),
  });

  const items = wishlist?.items ?? [];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-ink">Saved Items</h1>
      <p className="mb-6 text-sm text-ink-faint">Saved for later. Buy whenever you're ready.</p>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-surface-border p-8 text-center">
          <p className="mb-4 text-ink-faint">Nothing saved yet. Tap the heart on any quiz or practice test to save it here.</p>
          <div className="flex justify-center gap-3">
            <Link to="/home" className="rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted hover:border-brand-400">
              Browse Quiz Library
            </Link>
            <Link
              to="/home/practice-tests"
              className="rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted hover:border-brand-400"
            >
              Browse Practice Exams
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const inCart = inCartSet.has(`${item.itemType}_${item.itemId}`);
            const detailHref = item.itemType === 'quiz' ? `/home/quizzes/${item.itemId}` : `/home/practice-tests/${item.itemId}`;
            return (
              <div key={`${item.itemType}_${item.itemId}`} className="relative rounded-xl border border-surface-border bg-surface-raised p-4">
                <WishlistButton itemType={item.itemType} itemId={item.itemId} variant="inline" className="absolute right-3 top-3" />
                <Link to={detailHref} className="hover:text-brand-ink">
                  <div className="mb-1 pr-8 text-xs uppercase tracking-wide text-ink-faint">
                    {item.category} · {item.itemType === 'quiz' ? 'Exam Quiz' : 'Practice Test'}
                  </div>
                  <div className="mb-2 line-clamp-2 pr-8 font-medium leading-snug text-ink">{item.title}</div>
                </Link>
                <div className="mb-3 flex items-center gap-2">
                  {item.originalPrice && item.originalPrice > item.price && (
                    <span className="text-xs text-ink-faint line-through">{formatMoney(item.originalPrice, item.currency)}</span>
                  )}
                  <span className="font-semibold text-ink">{item.price > 0 ? formatMoney(item.price, item.currency) : 'Free'}</span>
                </div>

                {item.price === 0 ? (
                  <Link to={detailHref} className="block rounded-lg bg-brand-gradient py-2 text-center text-sm font-medium text-surface">
                    View
                  </Link>
                ) : inCart ? (
                  <Link
                    to="/home/cart"
                    className="block rounded-lg border border-blue-500/50 py-2 text-center text-sm font-medium text-blue-700 dark:text-blue-300"
                  >
                    ✓ In Cart · View Cart
                  </Link>
                ) : (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={addToCartMutation.isPending || paying}
                      onClick={() => addToCartMutation.mutate(item)}
                      className="flex-1 rounded-lg border border-surface-border py-2 text-sm font-medium text-ink-muted hover:border-blue-400 disabled:opacity-60"
                    >
                      Add to Cart
                    </button>
                    <button
                      type="button"
                      disabled={paying}
                      onClick={() => setBuyNowItem(item)}
                      className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
                    >
                      Buy Now
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {buyNowItem && (
        <BuyNowModal
          title={buyNowItem.title}
          price={buyNowItem.price}
          originalPrice={buyNowItem.originalPrice}
          currency={buyNowItem.currency}
          paying={paying}
          onClose={() => setBuyNowItem(null)}
          onConfirm={(couponCode) => {
            checkout({
              buyNowItem: { itemType: buyNowItem.itemType, itemId: buyNowItem.itemId },
              items: [{ itemType: buyNowItem.itemType, itemId: buyNowItem.itemId, title: buyNowItem.title }],
              couponCode,
            });
            setBuyNowItem(null);
          }}
        />
      )}
      {confirmation}
    </div>
  );
}
