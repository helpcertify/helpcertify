interface StarRatingProps {
  value: number;
  onChange?: (value: number) => void;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_PX: Record<'sm' | 'md' | 'lg', number> = { sm: 14, md: 18, lg: 24 };

const STAR_PATH = 'M12 2.5l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.8-6.2 3.8 1.6-7L2 9.7l7.1-.6z';

// Read-only mode (no onChange) used to render each star twice - a full row
// of muted background stars with a gold row clipped on top of it, the
// standard "percentage fill" trick. That relies on two separately
// rasterized SVGs landing pixel-for-pixel on top of each other, which
// browsers don't guarantee even when both layers use the identical shape:
// each SVG anti-aliases its own edges against transparency before the two
// get composited, so a visible gray fringe (and, on some renders, real
// misalignment) showed through at every star's edge regardless of the
// rating. Rendering exactly one <svg> per star instead - solid gold or
// solid gray for a whole star, and a single gradient-filled path only for
// the one star that's genuinely fractional - means there's never a second
// layer for the browser to misalign against.
function readOnlyStar(n: number, value: number, px: number) {
  const frac = Math.max(0, Math.min(1, value - (n - 1)));
  if (frac <= 0 || frac >= 1) {
    return (
      <svg key={n} viewBox="0 0 24 24" fill={frac >= 1 ? '#F59E0B' : '#E2E8F0'} style={{ width: px, height: px }} aria-hidden="true">
        <path d={STAR_PATH} />
      </svg>
    );
  }
  const gradientId = `star-fill-${n}-${px}-${Math.round(frac * 1000)}`;
  return (
    <svg key={n} viewBox="0 0 24 24" style={{ width: px, height: px }} aria-hidden="true">
      <defs>
        <linearGradient id={gradientId}>
          <stop offset={`${frac * 100}%`} stopColor="#F59E0B" />
          <stop offset={`${frac * 100}%`} stopColor="#E2E8F0" />
        </linearGradient>
      </defs>
      <path d={STAR_PATH} fill={`url(#${gradientId})`} />
    </svg>
  );
}

// Interactive mode (onChange provided) is a plain 1-5 click picker instead
// - a review can only submit a whole star count, no fractional input.
export function StarRating({ value, onChange, size = 'md' }: StarRatingProps) {
  const px = SIZE_PX[size];

  if (onChange) {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => onChange(n)} aria-label={`${n} star${n > 1 ? 's' : ''}`}>
            <svg viewBox="0 0 24 24" fill={n <= value ? '#F59E0B' : '#E2E8F0'} style={{ width: px, height: px }} aria-hidden="true">
              <path d={STAR_PATH} />
            </svg>
          </button>
        ))}
      </div>
    );
  }

  const clampedValue = Math.max(0, Math.min(5, value));
  return (
    <div className="inline-flex" style={{ width: px * 5, height: px }}>
      {[1, 2, 3, 4, 5].map((n) => readOnlyStar(n, clampedValue, px))}
    </div>
  );
}
