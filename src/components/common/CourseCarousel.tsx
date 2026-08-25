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
}

interface CourseCarouselProps {
  title: string;
  items: CarouselItem[];
  compactActions?: boolean;
}

// A horizontally-scrolling row of compact cards with prev/next arrows,
// shown only when there's actually more to reveal in that direction. Each
// card carries its own Add to Cart / Buy Now (or a Start/Resume link once
// owned), same as every other card in the app — no hover-expand panel
// (that was tried and then explicitly removed on request).
//
// Ownership/cart-membership is computed here rather than passed in by the
// caller: this component fetches the same ['student','cart']/
// ['student','purchases'] queries every other page already populates, so
// it works self-sufficiently regardless of which page renders it (and
// React Query dedupes the fetch against whatever the parent already
// loaded — no extra network round trip in practice).
export function CourseCarousel({ title, items, compactActions }: CourseCarouselProps) {
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
    scrollerRef.current?.scrollBy({ left: direction * 320, behavior: 'smooth' });
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

      <div ref={scrollerRef} className="scrollbar-none flex items-start gap-3 overflow-x-auto scroll-smooth pb-1">
        {items.map((item) => (
          <CarouselCard
            key={`${item.itemType}_${item.id}`}
            item={item}
            owned={item.price === 0 || purchasedSet.has(`${item.itemType}_${item.id}`)}
            inCart={inCartSet.has(`${item.itemType}_${item.id}`)}
            paying={paying}
            onBuyNow={() => setBuyNowItem(item)}
            compactActions={compactActions}
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
  compactActions?: boolean;
}

function CarouselCard({ item, owned, inCart, paying, onBuyNow, compactActions }: CarouselCardProps) {
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
    <div className="w-44 shrink-0 overflow-hidden rounded-xl border border-surface-border bg-surface-raised hover:border-brand-400 sm:w-52">
      <Link to={href}>
        <CourseCoverImage id={item.id} title={item.title} className="h-24 w-full" />
      </Link>
      <div className="p-3">
        <div className="mb-1 truncate text-[10px] uppercase tracking-wide text-ink-faint">
          {item.category} · {item.skillLevel}
        </div>
        <Link to={href} className="hover:text-brand-ink">
          <h3 className="line-clamp-2 text-sm font-bold leading-snug text-ink">{item.title}</h3>
        </Link>
        {item.ratingCount > 0 && (
          <div className="mt-1 flex items-center gap-1">
            <StarRating value={item.ratingAvg} size="sm" />
            <span className="text-xs text-ink-faint">{item.ratingAvg.toFixed(1)}</span>
          </div>
        )}
        <div className="mb-2 mt-1 text-xs font-semibold text-ink">
          {item.price > 0 ? formatMoney(item.price, item.currency) : 'Free'}
          {item.originalPrice && item.originalPrice > item.price && (
            <span className="ml-1.5 text-ink-faint line-through">{formatMoney(item.originalPrice, item.currency)}</span>
          )}
        </div>

        {!owned && (
          <div className={compactActions ? 'flex items-center gap-1' : 'flex flex-col gap-1.5'}>
            {inCart ? (
              <Link
                to="/home/cart"
                className={
                  compactActions
                    ? 'min-w-0 flex-1 truncate rounded-lg border border-blue-500/50 px-1 py-1 text-center text-[10px] font-medium text-blue-700 dark:text-blue-300'
                    : 'rounded-lg border border-blue-500/50 py-1.5 text-center text-xs font-medium text-blue-700 dark:text-blue-300'
                }
              >
                ✓ In Cart
              </Link>
            ) : (
              <button
                type="button"
                disabled={addToCartMutation.isPending}
                onClick={() => addToCartMutation.mutate()}
                className={
                  compactActions
                    ? 'min-w-0 flex-1 truncate rounded-lg border border-surface-border px-1 py-1 text-[10px] font-medium text-ink-muted hover:border-blue-400 disabled:opacity-60'
                    : 'rounded-lg border border-surface-border py-1.5 text-xs font-medium text-ink-muted hover:border-blue-400 disabled:opacity-60'
                }
              >
                {addToCartMutation.isPending ? 'Adding…' : 'Add to Cart'}
              </button>
            )}
            <button
              type="button"
              disabled={paying}
              onClick={onBuyNow}
              className={
                compactActions
                  ? 'min-w-0 flex-1 truncate rounded-lg bg-blue-600 px-1 py-1 text-[10px] font-medium text-white hover:bg-blue-500 disabled:opacity-60'
                  : 'rounded-lg bg-blue-600 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-60'
              }
            >
              {paying ? 'Opening…' : 'Buy Now'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
