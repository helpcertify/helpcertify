import type { CSSProperties } from 'react';

// Small hand-rolled line icons (24x24 viewBox, stroke-based, inherit
// currentColor for both fill and stroke) used where an emoji glyph proved
// unreliable across platforms/fonts — see the cart icon fix in
// StudentShell.tsx, where the 🛒 emoji was rendering as a near-invisible
// monochrome fallback glyph on at least one real device. Kept minimal on
// purpose; add more here only as an emoji actually needs replacing, not
// preemptively.

type IconProps = { className?: string };

export function CartIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="9" cy="21" r="1" fill="currentColor" stroke="none" />
      <circle cx="20" cy="21" r="1" fill="currentColor" stroke="none" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  );
}

export function SunIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

export function MoonIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

// Used by StarRating (ratings & reviews) in both a filled (solid gold) and
// outline (unfilled/muted) variant — see StarRating.tsx for how the two are
// composed into an average-rating badge and a click-to-pick star selector.
// Takes an explicit `style` too, unlike the icons above, since StarRating
// needs a size that varies by its own `size` prop rather than a fixed
// Tailwind class (a fully-interpolated class string wouldn't be picked up
// by Tailwind's static build-time scan).
export function StarIcon({ filled = true, className = 'h-4 w-4', style }: IconProps & { filled?: boolean; style?: CSSProperties }) {
  const path = 'M12 2.5l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.8-6.2 3.8 1.6-7L2 9.7l7.1-.6z';
  return filled ? (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} style={style} aria-hidden="true">
      <path d={path} />
    </svg>
  ) : (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}
