import { useId } from 'react';

export interface ScorePoint {
  label: string; // short date, e.g. "3 Sep"
  scorePct: number;
}

// A small single-series line chart of mock-exam score over time. Single
// series -> no legend (the caption names it); thin 2px line in the brand
// hue, recessive grid, values in ink tokens, last point directly labelled,
// per-point hover title. Pure SVG, theme-token colours, no library.
export function ScoreTrend({ points, className }: { points: ScorePoint[]; className?: string }) {
  const gradId = useId();
  if (points.length < 2) return null;

  const W = 520;
  const H = 160;
  const padL = 34;
  const padR = 44;
  const padT = 12;
  const padB = 24;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const x = (i: number) => padL + (i / (points.length - 1)) * plotW;
  const y = (v: number) => padT + plotH - (Math.max(0, Math.min(100, v)) / 100) * plotH;

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.scorePct).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${(padT + plotH).toFixed(1)} L${x(0).toFixed(1)},${(
    padT + plotH
  ).toFixed(1)} Z`;
  const last = points[points.length - 1];
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));

  return (
    <figure className={className}>
      <figcaption className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Score over time</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Mock exam score over time">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#155EEF" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#155EEF" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line x1={padL} x2={W - padR} y1={y(g)} y2={y(g)} className="stroke-surface-border" strokeWidth="1" />
            <text x={padL - 6} y={y(g) + 3} textAnchor="end" className="fill-ink-faint" style={{ fontSize: 9 }}>
              {g}
            </text>
          </g>
        ))}

        <path d={area} fill={`url(#${gradId})`} />
        <path d={line} fill="none" className="stroke-brand-500" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {points.map((p, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.scorePct)} r="4" className="fill-surface-raised stroke-brand-500" strokeWidth="2">
              <title>{`${p.label}: ${p.scorePct}%`}</title>
            </circle>
            {i % labelEvery === 0 && (
              <text x={x(i)} y={H - 8} textAnchor="middle" className="fill-ink-faint" style={{ fontSize: 9 }}>
                {p.label}
              </text>
            )}
          </g>
        ))}

        <text x={x(points.length - 1) + 6} y={y(last.scorePct) + 3} className="fill-ink" style={{ fontSize: 10, fontWeight: 700 }}>
          {last.scorePct}%
        </text>
      </svg>
    </figure>
  );
}
