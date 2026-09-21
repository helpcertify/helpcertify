import { useEffect, useState, type RefObject } from 'react';
import { PriceTag } from './PriceTag';
import { Spinner } from './Spinner';
import type { SupportedCurrency } from '@/utils/currency';

interface StickyBuyBarProps {
  title: string;
  price: number;
  originalPrice?: number | null;
  currency: SupportedCurrency;
  ctaLabel: string;
  onBuy: () => void;
  paying?: boolean;
  disabled?: boolean;
  // The element that, once scrolled out of view, means the learner has lost
  // sight of the real purchase panel and its price/buttons - that's the
  // only moment this bar should appear. Passed in by the page rather than
  // this component picking its own DOM target, since every detail page's
  // panel lives in a different place in the layout.
  watchRef: RefObject<HTMLElement>;
}

// A slim fixed-bottom bar that surfaces the price and the primary buy
// action once the learner has scrolled past the main purchase panel -
// mirrors the pattern every course marketplace uses so "buy" is never more
// than one scroll-back away. Guarded to do nothing when IntersectionObserver
// isn't available (older browsers, the prerender/SSR pass, and the test
// environment) rather than assuming it always exists.
export function StickyBuyBar({ title, price, originalPrice, currency, ctaLabel, onBuy, paying, disabled, watchRef }: StickyBuyBarProps) {
  const [showBar, setShowBar] = useState(false);

  useEffect(() => {
    const el = watchRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setShowBar(!entry.isIntersecting), { threshold: 0 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [watchRef]);

  if (!showBar) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-surface-border bg-surface-raised/95 px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur">
      <div className="mx-auto flex max-w-[1640px] items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-ink">{title}</div>
          <PriceTag price={price} originalPrice={originalPrice} currency={currency} size="sm" showDiscountBadge={false} />
        </div>
        <button
          type="button"
          disabled={disabled || paying}
          onClick={onBuy}
          className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-brand-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {paying && <Spinner className="h-4 w-4" />}
          {paying ? 'Opening…' : ctaLabel}
        </button>
      </div>
    </div>
  );
}
