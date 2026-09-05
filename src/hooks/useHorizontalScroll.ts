import { useEffect, useRef, useState } from 'react';

// The prev/next-arrow scroll behaviour for a horizontally scrolling row -
// extracted from CourseCarousel so CourseRow and any future row can share
// it. Arrows show only when there is more to reveal in that direction.
export function useHorizontalScroll(itemCount: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const el = ref.current;
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
  }, [itemCount]);

  const scrollBy = (direction: 1 | -1) => {
    ref.current?.scrollBy({ left: direction * 300, behavior: 'smooth' });
  };

  return { ref, canScrollLeft, canScrollRight, scrollBy };
}
