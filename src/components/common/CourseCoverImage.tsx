// Self-generated (no external image/asset needed) banner cover for quiz/
// practice test cards — a bold colored background with the exam/course
// name itself as large white text (matching a "Certified Information
// Systems Auditor (CISA)"-style banner), plus a small certificate-badge
// accent in the corner. Each item deterministically gets one of a handful
// of color pairs based on a hash of its id, so the same item always shows
// the same color and different items get variety.

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  return h;
}

const PALETTE: [string, string][] = [
  ['#1e3a8a', '#1e293b'], // navy -> slate
  ['#166534', '#14532d'], // green -> deep green
  ['#6d28d9', '#4c1d95'], // purple -> deep violet
  ['#9f1239', '#881337'], // burgundy
  ['#0f766e', '#134e4a'], // teal -> deep teal
  ['#c2410c', '#7c2d12'], // orange -> brown
];

// No real text-measurement API in plain SVG, so this is an approximation:
// bigger font for a short title, smaller (and wrapped further) for a long
// one, with a rough chars-per-line budget derived from the font size.
function layoutTitle(title: string): { lines: string[]; fontSize: number } {
  const len = title.length;
  const fontSize = len <= 10 ? 34 : len <= 20 ? 27 : len <= 32 ? 21 : 16;
  const maxCharsPerLine = Math.max(8, Math.floor(290 / (fontSize * 0.58)));

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
        {lines.map((line, i) => (
          <tspan key={i} x="160" dy={i === 0 ? 0 : lineHeight} fontSize={fontSize}>
            {line}
          </tspan>
        ))}
      </text>

      {/* small certification-badge accent, corner-placed and low-key next to the text */}
      <g transform="translate(296, 140)" opacity="0.9">
        <circle r="11" fill="none" stroke="white" strokeWidth="1.6" />
        <path d="M-4.5 0 L-1 3.5 L5.5 -4.5" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
