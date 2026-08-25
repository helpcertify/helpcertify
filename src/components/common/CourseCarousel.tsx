import { useRef, useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { cartApi } from '@/features/students/api/cartApi';
import { useUiStore } from '@/store/useUiStore';
import { formatMoney } from '@/utils/currency';
import { CourseCoverImage } from './CourseCoverImage';
import { StarRating } from './StarRating';
import { WishlistButton } from './WishlistButton';
import type { PurchasableItemType } from '@/types/models';

export interface CarouselItem {
  itemType: PurchasableItemType;
  id: string;
  title: string;
  category: string;
  skillLevel: string;
  description: string;
  statsLabel: string; // pre-formatted, e.g. "50 questions · 60 min" — quizzes and practice tests use different field names for this
  price: number;
  originalPrice: number | null;
  currency: 'INR' | 'USD';
  ratingAvg: number;
  ratingCount: number;
  owned: boolean;
}

interface CourseCarouselProps {
  title: string;
  items: CarouselItem[];
}

// A horizontally-scrolling row of compact cards with prev/next arrows
// (shown only when there's actually more to reveal in that direction) and
// an in-place hover expansion that reveals extra detail + a quick Add to
// Cart — the "browse a lot, learn more on hover" pattern common to
// course/media carousels. Built with this app's own cards, data, and blue
// branding rather than any copied assets.
//
// The hover-expand grows each card's own height in place (via a
// grid-template-rows 0fr->1fr transition) instead of a floating popover
// breaking out of the row. A floating popover would get clipped: once a
// container's overflow-x is anything but visible, overflow-y can't stay
// visible either (a real CSS constraint, not a choice), so a popover tall
// enough to escape upward would be cut off by this row's own horizontal
// scroll clipping. Growing in place sidesteps that entirely — the row is a
// plain flex container with no fixed height, so it just grows to fit
// whichever card is currently taller.
export function CourseCarousel({ title, items }: CourseCarouselProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

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
          <CarouselCard key={`${item.itemType}_${item.id}`} item={item} />
        ))}
      </div>
    </div>
  );
}

function CarouselCard({ item }: { item: CarouselItem }) {
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
    <div className="group w-44 shrink-0 sm:w-52">
      <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-raised transition-shadow group-hover:shadow-lg">
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
          <div className="mt-1 text-xs font-semibold text-ink">
            {item.price > 0 ? formatMoney(item.price, item.currency) : 'Free'}
            {item.originalPrice && item.originalPrice > item.price && (
              <span className="ml-1.5 text-ink-faint line-through">{formatMoney(item.originalPrice, item.currency)}</span>
            )}
          </div>

          <div className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-200 group-hover:grid-rows-[1fr]">
            <div className="overflow-hidden">
              {item.description && <p className="mb-2 mt-2 line-clamp-3 text-xs text-ink-muted">{item.description}</p>}
              <div className="mb-2 text-xs text-ink-faint">{item.statsLabel}</div>
              {!item.owned && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={addToCartMutation.isPending}
                    onClick={(e) => {
                      e.preventDefault();
                      addToCartMutation.mutate();
                    }}
                    className="flex-1 rounded-lg bg-blue-600 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-60"
                  >
                    {addToCartMutation.isPending ? 'Adding…' : 'Add to Cart'}
                  </button>
                  <WishlistButton itemType={item.itemType} itemId={item.id} variant="inline" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
