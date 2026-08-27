import { useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cartApi } from '@/features/students/api/cartApi';
import { useCheckout } from '@/features/students/hooks/useCheckout';
import { useUiStore } from '@/store/useUiStore';
import { formatMoney } from '@/utils/currency';
import { CourseIcon } from './CourseIcon';
import { StarRating } from './StarRating';
import { BuyNowModal } from './BuyNowModal';
import { WishlistButton } from './WishlistButton';
import { CategoryBadge } from './CardBits';
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

  // Context-aware label instead of a generic "Go start it" for an owned
  // item — a quiz is a timed Mock Exam, a practice test is untimed batched
  // practice, so the verb differs slightly even though the underlying
  // "go to the take page" behavior is identical either way.
  const ownedCtaLabel = item.itemType === 'quiz' ? 'Start Mock Exam' : 'Start Practice';

  return (
    // HelpCertify Electric Blue card: white surface, soft blue border/shadow,
    // a subtle blue-gradient header strip (icon + title) instead of the old
    // full-height saturated color banner, hover lift + shadow + border glow
    // as the "clickable" signal (translateY per the brand spec).
    <div className="flex w-60 shrink-0 flex-col overflow-hidden rounded-[14px] border border-[#DCE7FF] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.06)] transition-all duration-150 hover:-translate-y-[3px] hover:border-[#B9CEFF] hover:shadow-[0_8px_20px_rgba(21,94,239,0.12)] sm:w-72">
      <div className="relative bg-gradient-to-br from-[#EFF6FF] to-[#DBEAFE] p-4">
        <WishlistButton itemType={item.itemType} itemId={item.id} variant="inline" className="absolute right-3 top-3" />
        <Link to={href} className="flex items-start gap-3 pr-8">
          <CourseIcon id={item.id} title={item.title} itemType={item.itemType} />
          <h3 className="line-clamp-2 pt-1 text-[15px] font-semibold leading-snug text-[#0F172A]">{item.title}</h3>
        </Link>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-2">
          <CategoryBadge category={item.category} skillLevel={item.skillLevel} />
        </div>
        {item.ratingCount > 0 ? (
          <div className="mb-2 flex items-center gap-1.5">
            <StarRating value={item.ratingAvg} size="sm" />
            <span className="text-xs text-[#64748B]">{item.ratingAvg.toFixed(1)} ({item.ratingCount})</span>
          </div>
        ) : (
          <div className="mb-2 text-xs text-[#64748B]">No ratings yet</div>
        )}
        <div className="mb-3 flex items-center gap-2">
          {item.price > 0 ? (
            <>
              {item.originalPrice && item.originalPrice > item.price && (
                <span className="text-xs text-[#94A3B8] line-through">{formatMoney(item.originalPrice, item.currency)}</span>
              )}
              <span className="text-lg font-bold text-[#0F172A]">{formatMoney(item.price, item.currency)}</span>
            </>
          ) : (
            <span className="font-bold text-[#16A34A]">Free</span>
          )}
        </div>

        <div className="mt-auto">
          {!owned ? (
            inCart ? (
              <Link
                to="/home/cart"
                className="block rounded-lg border border-[#155EEF]/50 py-1.5 text-center text-sm font-semibold text-[#155EEF]"
              >
                ✓ In Cart · View Cart
              </Link>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={addToCartMutation.isPending || paying}
                  onClick={() => addToCartMutation.mutate()}
                  className="flex-1 rounded-lg border border-[#CBD5E1] bg-white py-1.5 text-sm font-semibold text-[#334155] transition-colors hover:border-[#155EEF] hover:bg-[#F8FAFF] hover:text-[#155EEF] disabled:opacity-60"
                >
                  {addToCartMutation.isPending ? 'Adding…' : 'Add to Cart'}
                </button>
                <button
                  type="button"
                  disabled={paying}
                  onClick={onBuyNow}
                  className="flex-1 rounded-lg bg-[#155EEF] py-1.5 text-sm font-semibold text-white transition-colors hover:bg-[#004EEB] disabled:opacity-60"
                >
                  {paying ? 'Opening…' : 'Buy Now'}
                </button>
              </div>
            )
          ) : (
            <Link
              to={href}
              className="block rounded-lg bg-[#155EEF] py-1.5 text-center text-sm font-semibold text-white transition-colors hover:bg-[#004EEB]"
            >
              {ownedCtaLabel}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
