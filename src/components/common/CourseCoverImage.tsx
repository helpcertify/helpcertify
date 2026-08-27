// Self-generated (no external image/asset needed) banner cover for quiz/
// practice test cards — a soft, muted colored background with the exam/
// course name itself as large white text. Each item deterministically gets
// one of a handful of color pairs based on a hash of its id, so the same
// item always shows the same color and different items get variety. The
// "Click here" affordance and any corner badge are drawn as real HTML
// overlays by the calling card, not inside this SVG (a plain decorative
// banner keeps this component simple and keeps the click target a real
// link, not shape hit-testing on an SVG element).

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  return h;
}

// Muted/dusty tones rather than the previous saturated navy/burgundy/deep-
// violet set — softer on the eye while still dark enough for white 800-
// weight text to stay readable (a truly light pastel wouldn't have enough
// contrast for that).
const PALETTE: [string, string][] = [
  ['#4f6f8f', '#3f5972'], // dusty blue
  ['#5f8f6f', '#4a7259'], // sage green
  ['#7a6a9f', '#5f5280'], // muted plum
  ['#b56b76', '#95535d'], // dusty rose
  ['#4f8f8a', '#3f716c'], // muted teal
  ['#c08a4f', '#9c6d3a'], // warm ochre
];

// No real text-measurement API in plain SVG, so this is an approximation:
// bigger font for a short title, smaller (and wrapped further) for a long
// one, with a rough chars-per-line budget derived from the font size — kept
// deliberately conservative (a smaller width budget, a larger per-char
// estimate) so a borderline-length line wraps to a second line rather than
// risk running past the card edge. CARD_WIDTH below is also used as a
// per-line textLength safety net (see the component), which compresses
// letter-spacing on any individual line the estimate still got wrong,
// rather than trusting the estimate alone to never overflow.
const CARD_WIDTH = 270;
const CHAR_WIDTH_FACTOR = 0.62;

function layoutTitle(title: string): { lines: string[]; fontSize: number } {
  const len = title.length;
  const fontSize = len <= 10 ? 34 : len <= 20 ? 27 : len <= 32 ? 21 : 16;
  const maxCharsPerLine = Math.max(8, Math.floor(CARD_WIDTH / (fontSize * CHAR_WIDTH_FACTOR)));

  const words = title.toUpperCase().split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return { lines, fontSize };
}

export function CourseCoverImage({ id, title, className = '' }: { id: string; title: string; className?: string }) {
  const hash = hashString(id);
  const [from, to] = PALETTE[hash % PALETTE.length];
  const gradId = `cover-grad-${hash}`;
  const { lines, fontSize } = layoutTitle(title);
  const lineHeight = fontSize * 1.15;
  const firstBaselineY = 80 - ((lines.length - 1) * lineHeight) / 2 + fontSize * 0.32;

  return (
    <svg viewBox="0 0 320 160" className={className} preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
      </defs>
      <rect width="320" height="160" fill={`url(#${gradId})`} />
      <circle cx="290" cy="18" r="70" fill="rgba(255,255,255,0.05)" />
      <circle cx="15" cy="150" r="55" fill="rgba(255,255,255,0.04)" />

      <text x="160" y={firstBaselineY} textAnchor="middle" fontWeight="800" fill="white" fontFamily="Arial, Helvetica, sans-serif">
        {lines.map((line, i) => {
          // Safety net on top of layoutTitle's estimate: if this specific
          // line still looks like it'd run past the card width, force it to
          // fit exactly via textLength instead of trusting the character-
          // count approximation not to be off. Short lines are left alone
          // (no textLength) so they aren't stretched to fill a width they
          // don't need.
          const estimatedWidth = line.length * fontSize * CHAR_WIDTH_FACTOR;
          const forceWidth = estimatedWidth > CARD_WIDTH ? CARD_WIDTH : undefined;
          return (
            <tspan
              key={i}
              x="160"
              dy={i === 0 ? 0 : lineHeight}
              fontSize={fontSize}
              textLength={forceWidth}
              lengthAdjust={forceWidth ? 'spacingAndGlyphs' : undefined}
            >
              {line}
            </tspan>
          );
        })}
      </text>
    </svg>
  );
}
