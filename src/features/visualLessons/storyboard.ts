// The visual-lesson data contract. This module is pure: no AI, no network,
// no React. The AI produces Storyboard JSON (see api/content-admin.ts's
// generateLessonStoryboard); the rendering engine (SceneRenderer /
// ScenePlayer) and any future Remotion composition consume it. Keeping the
// two sides apart is deliberate - swap the generator or the renderer
// without touching the other.

// Placeable technical objects the renderer knows how to draw. The AI is
// told to only use these ids (the same list is duplicated in the server
// prompt - keep them in sync). Arrows/connections are expressed in the
// scene's `animation` string, not as placeable objects.
export const VISUAL_COMPONENT_IDS = [
  'laptop',
  'browser',
  'server',
  'database',
  'dnsServer',
  'router',
  'switch',
  'firewall',
  'cloud',
  'certificate',
  'user',
  'api',
  'requestPacket',
  'responsePacket',
  'dataPacket',
  'encryptionIndicator',
] as const;
export type VisualComponentId = (typeof VISUAL_COMPONENT_IDS)[number];

export const VISUAL_TYPES = ['diagram', 'flow', 'sequence', 'comparison', 'timeline'] as const;
export type VisualType = (typeof VISUAL_TYPES)[number];

export interface Scene {
  id: string;
  order: number;
  title: string;
  narration: string;
  onScreenText: string;
  visualType: VisualType;
  components: VisualComponentId[];
  // A short, line-based instruction string the renderer interprets, e.g.
  //   highlight:server
  //   arrow:user->server
  //   fadeIn:database
  // Unknown lines are ignored, so a loose AI response still renders.
  animation: string;
  durationSeconds: number;
}

export interface Storyboard {
  scenes: Scene[];
  // Preferred narration voice (a SpeechSynthesis voice name); '' means the
  // player picks a default.
  voice: string;
  generatedAt: number;
}

const ID_ALIASES: Record<string, VisualComponentId> = {
  pc: 'laptop',
  computer: 'laptop',
  desktop: 'laptop',
  webbrowser: 'browser',
  dns: 'dnsServer',
  dnsserver: 'dnsServer',
  resolver: 'dnsServer',
  nameserver: 'dnsServer',
  db: 'database',
  datastore: 'database',
  gateway: 'router',
  loadbalancer: 'router',
  waf: 'firewall',
  internet: 'cloud',
  cert: 'certificate',
  tlscertificate: 'certificate',
  client: 'user',
  person: 'user',
  endpoint: 'api',
  service: 'api',
  request: 'requestPacket',
  query: 'requestPacket',
  response: 'responsePacket',
  reply: 'responsePacket',
  packet: 'dataPacket',
  data: 'dataPacket',
  lock: 'encryptionIndicator',
  encryption: 'encryptionIndicator',
  tls: 'encryptionIndicator',
};

const KNOWN = new Set<string>(VISUAL_COMPONENT_IDS);

// Maps a loose string ("DNS server", "dns_server", "Recursive Resolver")
// onto a known component id, or null if there is no sensible match.
export function normalizeComponentId(raw: string): VisualComponentId | null {
  const key = raw.trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (KNOWN.has(key)) return key as VisualComponentId;
  // camelCase ids collapse to lowercase above, so check those explicitly.
  const camel = VISUAL_COMPONENT_IDS.find((id) => id.toLowerCase() === key);
  if (camel) return camel;
  return ID_ALIASES[key] ?? null;
}

export function normalizeVisualType(raw: string): VisualType {
  const key = raw.trim().toLowerCase();
  return (VISUAL_TYPES as readonly string[]).includes(key) ? (key as VisualType) : 'diagram';
}

export function totalDurationSeconds(sb: Storyboard): number {
  return sb.scenes.reduce((sum, s) => sum + Math.max(1, s.durationSeconds), 0);
}

// Cumulative start time (seconds) of each scene.
export function sceneStartTimes(sb: Storyboard): number[] {
  const starts: number[] = [];
  let acc = 0;
  for (const s of sb.scenes) {
    starts.push(acc);
    acc += Math.max(1, s.durationSeconds);
  }
  return starts;
}

export interface SceneAtTime {
  scene: Scene;
  index: number;
  sceneElapsed: number;
  sceneProgress: number; // 0..1 within the scene
}

export function sceneAtTime(sb: Storyboard, seconds: number): SceneAtTime | null {
  if (sb.scenes.length === 0) return null;
  const clamped = Math.max(0, Math.min(seconds, totalDurationSeconds(sb) - 0.0001));
  const starts = sceneStartTimes(sb);
  let index = starts.length - 1;
  for (let i = 0; i < starts.length; i++) {
    if (clamped < starts[i]) {
      index = i - 1;
      break;
    }
  }
  if (index < 0) index = 0;
  const scene = sb.scenes[index];
  const dur = Math.max(1, scene.durationSeconds);
  const sceneElapsed = clamped - starts[index];
  return { scene, index, sceneElapsed, sceneProgress: Math.max(0, Math.min(1, sceneElapsed / dur)) };
}

export interface AnimationStep {
  op: 'highlight' | 'arrow' | 'fadeIn' | 'label' | 'pulse';
  from?: string;
  to?: string;
  target?: string;
  text?: string;
}

// Parses a scene's `animation` string into ordered steps. Tolerant: it
// accepts "arrow:a->b", "arrow a to b", "highlight: server", etc., and
// silently drops anything it cannot read.
export function parseAnimation(animation: string): AnimationStep[] {
  const steps: AnimationStep[] = [];
  for (const rawLine of (animation ?? '').split(/[\n;]+/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = /^(\w+)\s*[:-]?\s*(.*)$/.exec(line);
    if (!m) continue;
    const op = m[1].toLowerCase();
    const rest = m[2].trim();
    if (op === 'arrow' || op === 'connect' || op === 'flow') {
      const am = /(.+?)\s*(?:->|=>|to)\s*(.+)/i.exec(rest);
      if (am) steps.push({ op: 'arrow', from: am[1].trim(), to: am[2].trim() });
    } else if (op === 'highlight' || op === 'focus' || op === 'select') {
      if (rest) steps.push({ op: 'highlight', target: rest });
    } else if (op === 'fadein' || op === 'show' || op === 'reveal' || op === 'appear') {
      if (rest) steps.push({ op: 'fadeIn', target: rest });
    } else if (op === 'pulse' || op === 'blink') {
      if (rest) steps.push({ op: 'pulse', target: rest });
    } else if (op === 'label' || op === 'caption' || op === 'note') {
      if (rest) steps.push({ op: 'label', text: rest });
    }
  }
  return steps;
}
