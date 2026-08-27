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
import { CourseCoverImage } from '@/components/common/CourseCoverImage';
import { StarRating } from '@/components/common/StarRating';
import { ClickHereLink, CategoryBadge } from '@/components/common/CardBits';

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
            <Link to="/home/mock-exams" className="rounded-lg bg-[#1D4ED8] px-4 py-2 text-sm font-medium text-white hover:opacity-90">
              Browse Mock Exams
            </Link>
            <Link
              to="/home/practice-tests"
              className="rounded-lg bg-[#1D4ED8] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Browse Practice Exams
            </Link>
          </div>
        </div>
      ) : (
        // Same card anatomy as Practice Exams/Mock Exams (cover image,
        // category/level badges, rating, price, in-cart/buy-now branches) so
        // a saved item looks and behaves the same wherever it's browsed from.
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => {
            const inCart = inCartSet.has(`${item.itemType}_${item.itemId}`);
            const detailHref = item.itemType === 'quiz' ? `/home/quizzes/${item.itemId}` : `/home/practice-tests/${item.itemId}`;
            return (
              <div
                key={`${item.itemType}_${item.itemId}`}
                className="flex h-full flex-col overflow-hidden rounded-xl border border-surface-border bg-surface-raised transition-all duration-150 hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-lg"
              >
                <div className="relative">
                  <Link to={detailHref}>
                    <CourseCoverImage id={item.itemId} title={item.title} className="h-20 w-full" />
                  </Link>
                  <ClickHereLink href={detailHref} />
                </div>
                <div className="relative flex flex-1 flex-col p-3.5">
                  <WishlistButton itemType={item.itemType} itemId={item.itemId} variant="inline" className="absolute right-2.5 top-2.5" />
                  <Link to={detailHref} className="cursor-pointer hover:text-brand-ink hover:underline">
                    <h3 className="mb-1 line-clamp-2 pr-8 text-sm font-bold leading-snug text-ink">{item.title}</h3>
                  </Link>
                  <div className="mb-2">
                    <CategoryBadge category={item.category} skillLevel={item.skillLevel} />
                  </div>
                  {item.ratingCount > 0 ? (
                    <div className="mb-2 flex items-center gap-1.5">
                      <StarRating value={item.ratingAvg} size="sm" />
                      <span className="text-xs text-ink-faint">
                        {item.ratingAvg.toFixed(1)} ({item.ratingCount})
                      </span>
                    </div>
                  ) : (
                    <div className="mb-2 text-xs text-ink-faint">No ratings yet</div>
                  )}

                  <div className="mb-3 flex items-center gap-2">
                    {item.price > 0 ? (
                      <>
                        {item.originalPrice && item.originalPrice > item.price && (
                          <span className="text-xs text-ink-faint line-through">{formatMoney(item.originalPrice, item.currency)}</span>
                        )}
                        <span className="font-semibold text-ink">{formatMoney(item.price, item.currency)}</span>
                      </>
                    ) : (
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">Free</span>
                    )}
                  </div>

                  <div className="mt-auto">
                  {item.price === 0 ? (
                    <Link to={detailHref} className="block rounded-lg bg-[#1D4ED8] py-1.5 text-center text-sm font-medium text-white hover:opacity-90">
                      View
                    </Link>
                  ) : inCart ? (
                    <Link
                      to="/home/cart"
                      className="block rounded-lg border border-[#1D4ED8]/50 py-1.5 text-center text-sm font-medium text-[#1D4ED8]"
                    >
                      ✓ In Cart · View Cart
                    </Link>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={addToCartMutation.isPending || paying}
                        onClick={() => addToCartMutation.mutate(item)}
                        className="flex-1 rounded-lg border border-[#1D4ED8] py-1.5 text-sm font-medium text-[#1D4ED8] disabled:opacity-60"
                      >
                        Add to Cart
                      </button>
                      <button
                        type="button"
                        disabled={paying}
                        onClick={() => setBuyNowItem(item)}
                        className="flex-1 rounded-lg bg-[#1D4ED8] py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
                      >
                        Buy Now
                      </button>
                    </div>
                  )}
                  </div>
                </div>
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
