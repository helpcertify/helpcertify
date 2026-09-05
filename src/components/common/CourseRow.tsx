import { Link } from 'react-router-dom';
import { ProductCardShell } from './ProductCardShell';
import { useHorizontalScroll } from '@/hooks/useHorizontalScroll';

export interface CourseRowItem {
  id: string;
  title: string;
  category: string;
  skillLevel: string;
  price: number;
  originalPrice: number | null;
  currency: 'INR' | 'USD';
  ratingAvg: number;
  ratingCount: number;
  coverImageUrl: string | null;
}

interface CourseRowProps {
  title: string;
  items: CourseRowItem[];
  // Where a card links. Default: the signed-in course detail page.
  hrefFor?: (id: string) => string;
  ctaLabel?: string;
  seeAllHref?: string;
  // Shorter cards + tighter vertical rhythm for the home-page discovery rows.
  compact?: boolean;
}

// A horizontally-scrolling row of course cards (ProductCardShell,
// itemType="course"). Unlike CourseCarousel it does NOT self-fetch cart /
// purchases and has no Buy-Now modal - the caller decides where a card
// links (a signed-in learner goes to the reader; a logged-out visitor
// goes to sign-up). Presentational; owned/price logic stays with the
// caller.
export function CourseRow({ title, items, hrefFor, ctaLabel = 'View', seeAllHref, compact }: CourseRowProps) {
  const { ref, canScrollLeft, canScrollRight, hasOverflow, scrollBy } = useHorizontalScroll(items.length);
  const href = hrefFor ?? ((id: string) => `/home/courses/${id}`);

  if (items.length === 0) return null;

  return (
    <div className={compact ? 'mb-6' : 'mb-8'}>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-bold text-ink">{title}</h2>
        {seeAllHref && (
          <Link to={seeAllHref} className="text-xs font-semibold text-brand-ink hover:underline">
            See all &rarr;
          </Link>
        )}
      </div>

      {/* relative wrapper is the scroll row only (not the header), so the
          prev/next arrows sit vertically centred on the cards. */}
      <div className="relative">
        {hasOverflow && (
          <>
            <button
              type="button"
              onClick={() => scrollBy(-1)}
              disabled={!canScrollLeft}
              aria-label="Scroll left"
              className="absolute left-1 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-surface-border bg-surface-raised text-xl text-ink shadow-lg transition-opacity hover:border-brand-400 hover:text-brand-ink disabled:pointer-events-none disabled:opacity-0"
            >
              &lsaquo;
            </button>
            <button
              type="button"
              onClick={() => scrollBy(1)}
              disabled={!canScrollRight}
              aria-label="Scroll right"
              className="absolute right-1 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-surface-border bg-surface-raised text-xl text-ink shadow-lg transition-opacity hover:border-brand-400 hover:text-brand-ink disabled:pointer-events-none disabled:opacity-0"
            >
              &rsaquo;
            </button>
          </>
        )}

        <div ref={ref} className="scrollbar-none flex items-stretch gap-3 overflow-x-auto scroll-smooth pb-1">
        {items.map((c) => (
          <ProductCardShell
            key={c.id}
            id={c.id}
            itemType="course"
            title={c.title}
            category={c.category}
            skillLevel={c.skillLevel}
            ratingAvg={c.ratingAvg}
            ratingCount={c.ratingCount}
            price={c.price}
            originalPrice={c.originalPrice}
            currency={c.currency}
            coverImageUrl={c.coverImageUrl}
            compact={compact}
            detailHref={href(c.id)}
            footer={
              <Link
                to={href(c.id)}
                className="block rounded-lg bg-brand-500 py-1.5 text-center text-sm font-semibold text-white transition-colors hover:bg-brand-600"
              >
                {ctaLabel}
              </Link>
            }
          />
        ))}
        </div>
      </div>
    </div>
  );
}
