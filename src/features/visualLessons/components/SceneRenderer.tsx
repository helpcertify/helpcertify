import { useMemo } from 'react';
import { normalizeComponentId, parseAnimation, type Scene, type VisualComponentId } from '../storyboard';
import { VISUAL_COMPONENTS, COMPONENT_LABELS, type PrimitiveProps } from './primitives';

const W = 640;
const H = 360;

// Greedy word wrap into at most two lines for the on-screen caption.
function wrapText(text: string, maxChars: number): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = (cur + ' ' + w).trim();
    }
    if (lines.length === 2) break;
  }
  if (cur && lines.length < 2) lines.push(cur);
  if (lines.length === 2 && cur && lines[1] !== cur) lines[1] = `${lines[1]}…`;
  return lines;
}

interface Placed {
  id: VisualComponentId;
  key: string;
  x: number;
  y: number;
}

// Lays a scene's components across the canvas and returns each with a
// screen position, plus a lookup from loose names to positions for arrows.
function layout(components: VisualComponentId[]): { placed: Placed[]; locate: (name: string) => Placed | null } {
  const items = components.slice(0, 8);
  const perRow = items.length <= 4 ? items.length : Math.ceil(items.length / 2);
  const rows = Math.ceil(items.length / Math.max(1, perRow));
  const placed: Placed[] = items.map((id, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const countThisRow = Math.min(perRow, items.length - row * perRow);
    const gap = W / (countThisRow + 1);
    const y = rows === 1 ? H / 2 - 8 : 118 + row * 128;
    return { id, key: `${id}-${i}`, x: gap * (col + 1), y };
  });

  const locate = (raw: string): Placed | null => {
    const norm = normalizeComponentId(raw);
    if (norm) {
      const hit = placed.find((p) => p.id === norm);
      if (hit) return hit;
    }
    const lower = raw.trim().toLowerCase();
    return (
      placed.find((p) => COMPONENT_LABELS[p.id].toLowerCase() === lower) ??
      placed.find((p) => lower.includes(p.id.toLowerCase()) || lower.includes(COMPONENT_LABELS[p.id].toLowerCase())) ??
      null
    );
  };

  return { placed, locate };
}

interface SceneRendererProps {
  scene: Scene;
  // 0..1 within the scene.
  progress: number;
  className?: string;
}

// Draws one storyboard scene at a given progress point. Pure: same scene +
// progress always produce the same frame, which is what makes a later
// frame-by-frame Remotion render possible.
export function SceneRenderer({ scene, progress, className }: SceneRendererProps) {
  const norm = useMemo(
    () => Array.from(new Set(scene.components.map((c) => normalizeComponentId(String(c))).filter(Boolean) as VisualComponentId[])),
    [scene.components],
  );
  const { placed, locate } = useMemo(() => layout(norm), [norm]);
  const steps = useMemo(() => parseAnimation(scene.animation), [scene.animation]);

  // Components fade in across the first 35% of the scene; animation steps
  // stagger across the rest.
  const introEnd = 0.35;
  const revealed = new Set<string>();
  const arrows: { from: Placed; to: Placed; t: number }[] = [];
  steps.forEach((step, i) => {
    const stepStart = introEnd + (i / Math.max(1, steps.length)) * (1 - introEnd);
    const stepT = Math.max(0, Math.min(1, (progress - stepStart) / ((1 - introEnd) / Math.max(1, steps.length))));
    if (stepT <= 0) return;
    if (step.op === 'highlight' || step.op === 'pulse') {
      const hit = step.target ? locate(step.target) : null;
      if (hit) revealed.add(`hl:${hit.key}`);
    } else if (step.op === 'arrow') {
      const from = step.from ? locate(step.from) : null;
      const to = step.to ? locate(step.to) : null;
      if (from && to) arrows.push({ from, to, t: stepT });
    }
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`text-ink ${className ?? ''}`} role="img" aria-label={scene.title} style={{ width: '100%' }}>
      <defs>
        <marker id="vl-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="#155EEF" />
        </marker>
      </defs>

      {scene.title && (
        <text x={20} y={28} fontSize={16} fontWeight={700} fill="currentColor">
          {scene.title}
        </text>
      )}

      {arrows.map((a, i) => {
        const dx = a.to.x - a.from.x;
        const dy = a.to.y - a.from.y;
        const len = Math.hypot(dx, dy) || 1;
        const pad = 34;
        const x1 = a.from.x + (dx / len) * pad;
        const y1 = a.from.y + (dy / len) * pad;
        const x2 = a.from.x + (dx / len) * (len - pad);
        const y2 = a.from.y + (dy / len) * (len - pad);
        const cx = x1 + (x2 - x1) * a.t;
        const cy = y1 + (y2 - y1) * a.t;
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={cx}
            y2={cy}
            stroke="#155EEF"
            strokeWidth={2}
            markerEnd={a.t > 0.98 ? 'url(#vl-arrow)' : undefined}
          />
        );
      })}

      {placed.map((p, i) => {
        const Comp = VISUAL_COMPONENTS[p.id];
        const fadeStart = (i / Math.max(1, placed.length)) * introEnd;
        const opacity = Math.max(0, Math.min(1, (progress - fadeStart) / Math.max(0.001, introEnd / 2)));
        const props: PrimitiveProps = {
          x: p.x,
          y: p.y,
          label: COMPONENT_LABELS[p.id],
          highlighted: revealed.has(`hl:${p.key}`),
          opacity,
        };
        return <Comp key={p.key} {...props} />;
      })}

      {scene.onScreenText && (
        <text x={W / 2} y={H - 34} textAnchor="middle" fontSize={13} fill="currentColor">
          {wrapText(scene.onScreenText, 78).map((line, i) => (
            <tspan key={i} x={W / 2} dy={i === 0 ? 0 : 16}>
              {line}
            </tspan>
          ))}
        </text>
      )}
    </svg>
  );
}
