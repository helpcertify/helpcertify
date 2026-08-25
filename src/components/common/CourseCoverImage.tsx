// Self-generated (no external image/asset needed) cover art for quiz/practice
// test cards — a small digital-credential-style badge/seal, not a loud
// marketing banner. Deliberately subtle: no filled background of its own
// (the card's existing bg-surface-raised shows through, so it's correct in
// both themes automatically), and every stroke/fill below reads its color
// from this app's own CSS variables (--color-brand-ink etc., see
// globals.css) rather than inventing a separate palette — so it looks like
// part of the UI, not a pasted-in illustration. Each item deterministically
// gets one of a few badge icons based on a hash of its id, for a little
// visual variety without a rainbow of colors.

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  return h;
}

const BRAND = 'rgb(var(--color-brand-ink))';
const FAINT = 'rgb(var(--color-brand-ink) / 0.10)';
const BORDER = 'rgb(var(--color-surface-border))';

function CheckIcon() {
  return <path d="M-8 0 L-2 6 L10 -8" stroke={BRAND} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />;
}
function StarIcon() {
  return (
    <path
      d="M0 -11 L3.2 -3.6 L11 -3.4 L4.8 1.6 L7 9 L0 4.6 L-7 9 L-4.8 1.6 L-11 -3.4 L-3.2 -3.6 Z"
      fill={BRAND}
    />
  );
}
function BookIcon() {
  return (
    <path
      d="M0 -7 C-3.5 -9.5 -9 -10 -11 -9 V8 C-9 7 -3.5 7.5 0 10 C3.5 7.5 9 7 11 8 V-9 C9 -10 3.5 -9.5 0 -7 Z M0 -7 V10"
      stroke={BRAND}
      strokeWidth="2"
      fill="none"
      strokeLinejoin="round"
    />
  );
}
function BoltIcon() {
  return <path d="M2 -11 L-8 2 L-1 2 L-2 11 L8 -2 L1 -2 Z" fill={BRAND} />;
}

const ICONS = [CheckIcon, StarIcon, BookIcon, BoltIcon];

export function CourseCoverImage({ seed, className = '' }: { seed: string; className?: string }) {
  const hash = hashString(seed);
  const Icon = ICONS[hash % ICONS.length];
  // A handful of fixed rotations for the badge so a grid of cards doesn't
  // look perfectly identical, without introducing any new color.
  const tilt = [0, -6, 6, -3, 3][hash % 5];

  return (
    <svg viewBox="0 0 320 160" className={className} preserveAspectRatio="xMidYMid meet">
      {/* faint dotted texture, purely decorative */}
      {Array.from({ length: 6 }, (_, col) =>
        Array.from({ length: 3 }, (_, row) => (
          <circle key={`${col}-${row}`} cx={30 + col * 52} cy={26 + row * 54} r="1.4" fill={BORDER} />
        ))
      )}

      <g transform={`translate(160, 80) rotate(${tilt})`}>
        {/* ribbon tails */}
        <path d="M-14 18 L-22 46 L-8 38 Z" fill={FAINT} stroke={BRAND} strokeWidth="1.5" />
        <path d="M14 18 L22 46 L8 38 Z" fill={FAINT} stroke={BRAND} strokeWidth="1.5" />
        {/* seal */}
        <circle r="26" fill={FAINT} stroke={BRAND} strokeWidth="2" />
        <circle r="21" fill="none" stroke={BRAND} strokeWidth="1" strokeDasharray="2 3" opacity="0.6" />
        <Icon />
      </g>
    </svg>
  );
}
