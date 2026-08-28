import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { wishlistApi, type WishlistItemView } from '../api/wishlistApi';
import { cartApi } from '../api/cartApi';
import { useCheckout } from '../hooks/useCheckout';
import { useUiStore } from '@/store/useUiStore';
import { BuyNowModal } from '@/components/common/BuyNowModal';
import { ProductCardShell } from '@/components/common/ProductCardShell';

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
            <Link to="/home/mock-exams" className="rounded-lg bg-[#155EEF] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#004EEB]">
              Browse Mock Exams
            </Link>
            <Link
              to="/home/practice-tests"
              className="rounded-lg bg-[#155EEF] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#004EEB]"
            >
              Browse Practice Exams
            </Link>
          </div>
        </div>
      ) : (
        // Same card anatomy as Practice Exams/Mock Exams/Recommended for
        // you (same ProductCardShell, same w-60/sm:w-72 size) so a saved
        // item looks and behaves the same wherever it's browsed from.
        <div className="flex flex-wrap gap-4">
          {items.map((item) => {
            const inCart = inCartSet.has(`${item.itemType}_${item.itemId}`);
            const detailHref = item.itemType === 'quiz' ? `/home/quizzes/${item.itemId}` : `/home/practice-tests/${item.itemId}`;
            const footer =
              item.price === 0 ? (
                <Link to={detailHref} className="block rounded-lg bg-[#155EEF] py-1.5 text-center text-sm font-semibold text-white transition-colors hover:bg-[#004EEB]">
                  View
                </Link>
              ) : inCart ? (
                <Link to="/home/cart" className="block rounded-lg border border-[#155EEF]/50 py-1.5 text-center text-sm font-semibold text-[#155EEF]">
                  ✓ In Cart · View Cart
                </Link>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={addToCartMutation.isPending || paying}
                    onClick={() => addToCartMutation.mutate(item)}
                    className="flex-1 rounded-lg border border-[#CBD5E1] bg-white py-1.5 text-sm font-semibold text-[#334155] transition-colors hover:border-[#155EEF] hover:bg-[#F8FAFF] hover:text-[#155EEF] disabled:opacity-60"
                  >
                    Add to Cart
                  </button>
                  <button
                    type="button"
                    disabled={paying}
                    onClick={() => setBuyNowItem(item)}
                    className="flex-1 rounded-lg bg-[#155EEF] py-1.5 text-sm font-semibold text-white transition-colors hover:bg-[#004EEB] disabled:opacity-60"
                  >
                    Buy Now
                  </button>
                </div>
              );
            return (
              <ProductCardShell
                key={`${item.itemType}_${item.itemId}`}
                id={item.itemId}
                itemType={item.itemType}
                title={item.title}
                category={item.category}
                skillLevel={item.skillLevel}
                ratingAvg={item.ratingAvg}
                ratingCount={item.ratingCount}
                price={item.price}
                originalPrice={item.originalPrice}
                currency={item.currency}
                detailHref={detailHref}
                footer={footer}
              />
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
          onConfirm={(couponCode, useCredit) => {
            checkout({
              buyNowItem: { itemType: buyNowItem.itemType, itemId: buyNowItem.itemId },
              items: [{ itemType: buyNowItem.itemType, itemId: buyNowItem.itemId, title: buyNowItem.title }],
              couponCode,
              useCredit,
            });
            setBuyNowItem(null);
          }}
        />
      )}
      {confirmation}
    </div>
  );
}
