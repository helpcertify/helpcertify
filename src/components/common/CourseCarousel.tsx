import { useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { formatMoney } from '@/utils/currency';
import { CourseCoverImage } from './CourseCoverImage';
import { StarRating } from './StarRating';
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
}

// A horizontally-scrolling row of compact cards with prev/next arrows,
// shown only when there's actually more to reveal in that direction. Each
// card just links through to its detail page — no hover-expand panel (that
// was tried and then explicitly removed on request).
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
  const href = item.itemType === 'quiz' ? `/home/quizzes/${item.id}` : `/home/practice-tests/${item.id}`;

  return (
    <Link
      to={href}
      className="block w-44 shrink-0 overflow-hidden rounded-xl border border-surface-border bg-surface-raised hover:border-brand-400 sm:w-52"
    >
      <CourseCoverImage id={item.id} title={item.title} className="h-24 w-full" />
      <div className="p-3">
        <div className="mb-1 truncate text-[10px] uppercase tracking-wide text-ink-faint">
          {item.category} · {item.skillLevel}
        </div>
        <h3 className="line-clamp-2 text-sm font-bold leading-snug text-ink">{item.title}</h3>
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
      </div>
    </Link>
  );
}
