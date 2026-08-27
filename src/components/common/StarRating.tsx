import { StarIcon } from './icons';

interface StarRatingProps {
  value: number;
  onChange?: (value: number) => void;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_PX: Record<'sm' | 'md' | 'lg', number> = { sm: 14, md: 18, lg: 24 };

// Read-only mode (no onChange) shows a fractional average as a clipped
// overlay of solid gold stars over a row of muted outline stars — the
// standard "percentage fill" trick (e.g. clipping to 86% reads as ~4.3/5).
// It's not precise per individual star boundary, but that's how every
// rating widget like this works and it reads correctly at a glance.
// Interactive mode (onChange provided) is a plain 1-5 click picker instead
// — a review can only submit a whole star count, no fractional input.
export function StarRating({ value, onChange, size = 'md' }: StarRatingProps) {
  const px = SIZE_PX[size];

  if (onChange) {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => onChange(n)} aria-label={`${n} star${n > 1 ? 's' : ''}`} className="text-[#F59E0B]">
            <StarIcon filled={n <= value} style={{ width: px, height: px }} />
          </button>
        ))}
      </div>
    );
  }

  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <div className="relative inline-flex" style={{ width: px * 5, height: px }}>
      {/* Background row must render outline (unfilled) stars explicitly —
          StarIcon defaults filled to true, so leaving this unset made every
          "empty" star render as a solid star in a faint color instead of a
          proper outline, everywhere a read-only rating is shown (product
          cards, detail-page headers, review lists). */}
      <div className="absolute inset-0 flex text-[#CBD5E1]">
        {[1, 2, 3, 4, 5].map((n) => (
          <StarIcon key={n} filled={false} style={{ width: px, height: px }} />
        ))}
      </div>
      <div className="absolute inset-0 flex overflow-hidden text-[#F59E0B]" style={{ width: `${pct}%` }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <StarIcon key={n} filled style={{ width: px, height: px }} />
        ))}
      </div>
    </div>
  );
}
