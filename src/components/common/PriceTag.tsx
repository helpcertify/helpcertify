import { formatMoney, type SupportedCurrency } from '@/utils/currency';
import { Badge } from '@/components/ui';

interface PriceTagProps {
  // Minor units (paise/cents), matching formatMoney everywhere else.
  price: number;
  originalPrice?: number | null;
  currency: SupportedCurrency;
  // 'sm' for tight inline rows (cart line items), 'md' for cards (the
  // default), 'lg' for a page/panel's headline price (course detail,
  // package selector, checkout). The current price is always the loudest
  // thing in the group - that's the point of this component.
  size?: 'sm' | 'md' | 'lg';
  // Hide the "N% off" pill without hiding the struck-through original
  // price - a few tight layouts (cart rows) want the strikethrough but
  // don't have room for a badge too.
  showDiscountBadge?: boolean;
  className?: string;
}

const PRICE_SIZE: Record<NonNullable<PriceTagProps['size']>, string> = {
  sm: 'text-base',
  md: 'text-xl',
  lg: 'text-3xl',
};

const ORIGINAL_SIZE: Record<NonNullable<PriceTagProps['size']>, string> = {
  sm: 'text-[11px]',
  md: 'text-xs',
  lg: 'text-sm',
};

const FREE_SIZE: Record<NonNullable<PriceTagProps['size']>, string> = {
  sm: 'text-sm',
  md: 'text-lg',
  lg: 'text-2xl',
};

// The one place price is ever rendered, so "the price is the loudest thing
// on the card" (large, bold, its own color weight) and "a real discount
// always shows the saving" stay true everywhere at once instead of drifting
// card by card. Free items get their own green treatment rather than
// blending into a ₹0 that reads as broken.
export function PriceTag({ price, originalPrice, currency, size = 'md', showDiscountBadge = true, className = '' }: PriceTagProps) {
  if (price <= 0) {
    return <span className={`font-extrabold text-success ${FREE_SIZE[size]} ${className}`}>Free</span>;
  }

  const hasDiscount = !!originalPrice && originalPrice > price;
  const pct = hasDiscount ? Math.round(((originalPrice! - price) / originalPrice!) * 100) : 0;

  return (
    <span className={`inline-flex flex-wrap items-baseline gap-x-2 gap-y-1 ${className}`}>
      <span className={`font-extrabold tracking-tight text-ink [font-variant-numeric:tabular-nums] ${PRICE_SIZE[size]}`}>
        {formatMoney(price, currency)}
      </span>
      {hasDiscount && (
        <span className={`text-ink-faint line-through [font-variant-numeric:tabular-nums] ${ORIGINAL_SIZE[size]}`}>
          {formatMoney(originalPrice!, currency)}
        </span>
      )}
      {hasDiscount && showDiscountBadge && pct > 0 && (
        <Badge tone="danger" dot={false} className="font-bold uppercase">
          {pct}% off
        </Badge>
      )}
    </span>
  );
}
