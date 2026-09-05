import { useEffect, useRef, useState } from 'react';

// The prev/next-arrow scroll behaviour for a horizontally scrolling row -
// extracted from CourseCarousel so CourseRow and any future row can share
// it. Arrows show only when there is more to reveal in that direction.
export function useHorizontalScroll(itemCount: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  // True whenever the row's content is wider than its viewport, regardless
  // of the current scroll position - lets a caller keep BOTH arrows on
  // screen the whole time and just disable the one that can't move.
  const [hasOverflow, setHasOverflow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      setCanScrollLeft(el.scrollLeft > 4);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
      setHasOverflow(el.scrollWidth > el.clientWidth + 4);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    // Cover async content (images loading, data arriving after mount).
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      ro?.disconnect();
    };
  }, [itemCount]);

  const scrollBy = (direction: 1 | -1) => {
    ref.current?.scrollBy({ left: direction * 300, behavior: 'smooth' });
  };

  return { ref, canScrollLeft, canScrollRight, hasOverflow, scrollBy };
}
