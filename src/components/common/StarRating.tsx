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

  const clampedValue = Math.max(0, Math.min(5, value));
  // An exact pixel width, not a percentage of the row. A percentage is
  // measured against the flex row's own layout and rounds to whatever
  // subpixel the browser snaps it to, which almost never lands exactly on
  // a star's edge — leaving a hairline of the background star visible
  // even though both layers already use the identical filled shape. A
  // fixed pixel width has nothing to round against: the two layers are
  // built from the same px*5 total, so the clip boundary always lands
  // precisely between stars (or, for a fractional rating, at the same
  // fraction of the same star in both layers).
  const overlayWidth = (clampedValue / 5) * px * 5;
  return (
    <div className="relative inline-flex" style={{ width: px * 5, height: px }}>
      {/* Background row uses the same filled star shape as the gold overlay
          (not the stroked outline variant) — StarIcon's outline path draws
          a centered stroke around the same points, which renders visibly
          larger than the solid fill at these icon sizes, so the two layers
          never lined up and a gray sliver of the background star always
          peeked out from behind the gold one. Identical shapes, only the
          color differs, guarantees the overlay clips exactly on top. */}
      <div className="absolute inset-0 flex text-[#E2E8F0]">
        {[1, 2, 3, 4, 5].map((n) => (
          <StarIcon key={n} filled style={{ width: px, height: px }} />
        ))}
      </div>
      <div className="absolute inset-0 flex overflow-hidden text-[#F59E0B]" style={{ width: `${overlayWidth}px` }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <StarIcon key={n} filled style={{ width: px, height: px }} />
        ))}
      </div>
    </div>
  );
}
