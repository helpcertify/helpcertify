import { useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cartApi } from '@/features/students/api/cartApi';
import { useCheckout } from '@/features/students/hooks/useCheckout';
import { useUiStore } from '@/store/useUiStore';
import { formatMoney } from '@/utils/currency';
import { CourseCoverImage } from './CourseCoverImage';
import { StarRating } from './StarRating';
import { BuyNowModal } from './BuyNowModal';
import { WishlistButton } from './WishlistButton';
import { ClickHereLink, CategoryBadge } from './CardBits';
import type { PurchasableItemType } from '@/types/models';

export interface CarouselItem {
  itemType: PurchasableItemType;
  id: string;
  title: string;
  category: string;
  skillLevel: string;
  price: number;
  originalPrice: number | null;
  currency: 'INR' | 'USD';
  ratingAvg: number;
  ratingCount: number;
  totalQuestions: number;
}

interface CourseCarouselProps {
  title: string;
  items: CarouselItem[];
}

// A horizontally-scrolling row of cards with prev/next arrows, shown only
// when there's actually more to reveal in that direction. Each card carries
// its own Add to Cart / Buy Now / wishlist heart (or a Start/Resume link
// once owned), same anatomy as every other product card in the app.
//
// Ownership/cart-membership is computed here rather than passed in by the
// caller: this component fetches the same ['student','cart']/
// ['student','purchases'] queries every other page already populates, so
// it works self-sufficiently regardless of which page renders it (and
// React Query dedupes the fetch against whatever the parent already
// loaded — no extra network round trip in practice).
export function CourseCarousel({ title, items }: CourseCarouselProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const { checkout, paying, confirmation } = useCheckout();
  const [buyNowItem, setBuyNowItem] = useState<CarouselItem | null>(null);

  const { data: cart } = useQuery({ queryKey: ['student', 'cart'], queryFn: cartApi.getCart });
  const { data: purchases } = useQuery({ queryKey: ['student', 'purchases'], queryFn: cartApi.listMyPurchases });
  const purchasedSet = new Set((purchases?.purchases ?? []).map((p) => `${p.itemType}_${p.itemId}`));
  const inCartSet = new Set((cart?.items ?? []).map((i) => `${i.itemType}_${i.itemId}`));

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => {
      setCanScrollLeft(el.scrollLeft > 4);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [items.length]);

  const scroll = (direction: 1 | -1) => {
    scrollerRef.current?.scrollBy({ left: direction * 300, behavior: 'smooth' });
  };

  if (items.length === 0) return null;

  return (
    <div className="relative mb-8">
      <h2 className="mb-3 text-lg font-bold text-ink">{title}</h2>

      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scroll(-1)}
          aria-label="Scroll left"
          className="absolute -left-3 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-surface-border bg-surface-raised text-lg text-ink shadow-md hover:border-brand-400"
        >
          ‹
        </button>
      )}
      {canScrollRight && (
        <button
          type="button"
          onClick={() => scroll(1)}
          aria-label="Scroll right"
          className="absolute -right-3 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-surface-border bg-surface-raised text-lg text-ink shadow-md hover:border-brand-400"
        >
          ›
        </button>
      )}

      <div ref={scrollerRef} className="scrollbar-none flex items-stretch gap-3 overflow-x-auto scroll-smooth pb-1">
        {items.map((item) => (
          <CarouselCard
            key={`${item.itemType}_${item.id}`}
            item={item}
            owned={item.price === 0 || purchasedSet.has(`${item.itemType}_${item.id}`)}
            inCart={inCartSet.has(`${item.itemType}_${item.id}`)}
            paying={paying}
            onBuyNow={() => setBuyNowItem(item)}
          />
        ))}
      </div>

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
              buyNowItem: { itemType: buyNowItem.itemType, itemId: buyNowItem.id },
              items: [{ itemType: buyNowItem.itemType, itemId: buyNowItem.id, title: buyNowItem.title }],
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

interface CarouselCardProps {
  item: CarouselItem;
  owned: boolean;
  inCart: boolean;
  paying: boolean;
  onBuyNow: () => void;
}

function CarouselCard({ item, owned, inCart, paying, onBuyNow }: CarouselCardProps) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const href = item.itemType === 'quiz' ? `/home/quizzes/${item.id}` : `/home/practice-tests/${item.id}`;

  const addToCartMutation = useMutation({
    mutationFn: () => cartApi.addItem(item.itemType, item.id),
    onSuccess: (data) => {
      queryClient.setQueryData(['student', 'cart'], data);
      pushToast('Added to cart', 'success');
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : 'Could not add to cart', 'error'),
  });

  return (
    // Widened and given a shorter cover relative to that width (h-28 on a
    // w-60/w-72 card, versus the old h-24 on w-44/w-52) so the card reads
    // as a landscape rectangle rather than the previous narrow, more
    // square-ish shape. Same anatomy as PracticeTestsPage's card now (cover
    // + Click here link, wishlist heart, category badge, rating, price,
    // actions) so every card in the app reads the same way.
    <div className="flex w-60 shrink-0 flex-col overflow-hidden rounded-xl border border-surface-border bg-surface-raised transition-all duration-150 hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-lg sm:w-72">
      <div className="relative">
        <Link to={href}>
          <CourseCoverImage id={item.id} title={item.title} className="h-28 w-full" />
        </Link>
        <ClickHereLink href={href} />
      </div>
      <div className="relative flex flex-1 flex-col p-4">
        <WishlistButton itemType={item.itemType} itemId={item.id} variant="inline" className="absolute right-3 top-3" />
        <Link to={href} className="cursor-pointer pr-8 hover:text-brand-ink hover:underline">
          <h3 className="mb-1 line-clamp-2 text-sm font-bold leading-snug text-ink">{item.title}</h3>
        </Link>
        <div className="mb-2">
          <CategoryBadge category={item.category} skillLevel={item.skillLevel} />
        </div>
        {item.ratingCount > 0 ? (
          <div className="mb-2 flex items-center gap-1.5">
            <StarRating value={item.ratingAvg} size="sm" />
            <span className="text-xs text-ink-faint">{item.ratingAvg.toFixed(1)} ({item.ratingCount})</span>
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
          {!owned ? (
            inCart ? (
              <Link to="/home/cart" className="block rounded-lg border border-[#1D4ED8]/50 py-1.5 text-center text-sm font-medium text-[#1D4ED8]">
                ✓ In Cart · View Cart
              </Link>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={addToCartMutation.isPending || paying}
                  onClick={() => addToCartMutation.mutate()}
                  className="flex-1 rounded-lg border border-surface-border py-1.5 text-sm font-medium text-ink-muted hover:opacity-80 disabled:opacity-60"
                >
                  {addToCartMutation.isPending ? 'Adding…' : 'Add to Cart'}
                </button>
                <button
                  type="button"
                  disabled={paying}
                  onClick={onBuyNow}
                  className="flex-1 rounded-lg bg-[#1D4ED8] py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
                >
                  {paying ? 'Opening…' : 'Buy Now'}
                </button>
              </div>
            )
          ) : (
            <Link
              to={href}
              className="block rounded-lg bg-[#1D4ED8] py-1.5 text-center text-sm font-medium text-white hover:opacity-90"
            >
              Go start it →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
