import { describe, it, expect } from 'vitest';
import {
  VISUAL_COMPONENT_IDS,
  normalizeComponentId,
  normalizeVisualType,
  totalDurationSeconds,
  sceneStartTimes,
  sceneAtTime,
  parseAnimation,
  type Storyboard,
  type Scene,
} from './storyboard';

const scene = (over: Partial<Scene> & { id: string; order: number }): Scene => ({
  title: 'S',
  narration: 'n',
  onScreenText: 't',
  visualType: 'diagram',
  components: [],
  animation: '',
  durationSeconds: 5,
  ...over,
});

const sb = (scenes: Scene[]): Storyboard => ({ scenes, voice: '', generatedAt: 0 });

describe('storyboard helpers', () => {
  it('normalizeComponentId maps known ids and common aliases', () => {
    expect(normalizeComponentId('server')).toBe('server');
    expect(normalizeComponentId('DNS server')).toBe('dnsServer');
    expect(normalizeComponentId('dns_server')).toBe('dnsServer');
    expect(normalizeComponentId('Recursive Resolver')).toBe(null);
    expect(normalizeComponentId('resolver')).toBe('dnsServer');
    expect(normalizeComponentId('unknown thing')).toBe(null);
  });

  it('normalizeVisualType falls back to diagram', () => {
    expect(normalizeVisualType('SEQUENCE')).toBe('sequence');
    expect(normalizeVisualType('cinematic')).toBe('diagram');
  });

  it('totalDurationSeconds and sceneStartTimes', () => {
    const s = sb([scene({ id: 'a', order: 0, durationSeconds: 4 }), scene({ id: 'b', order: 1, durationSeconds: 6 })]);
    expect(totalDurationSeconds(s)).toBe(10);
    expect(sceneStartTimes(s)).toEqual([0, 4]);
  });

  it('sceneAtTime resolves the active scene and progress', () => {
    const s = sb([scene({ id: 'a', order: 0, durationSeconds: 4 }), scene({ id: 'b', order: 1, durationSeconds: 4 })]);
    expect(sceneAtTime(s, 0)?.index).toBe(0);
    expect(sceneAtTime(s, 2)?.sceneProgress).toBeCloseTo(0.5);
    expect(sceneAtTime(s, 5)?.index).toBe(1);
    expect(sceneAtTime(s, 999)?.index).toBe(1);
    expect(sceneAtTime(sb([]), 1)).toBe(null);
  });

  it('parseAnimation reads arrows, highlights and reveals, dropping junk', () => {
    const steps = parseAnimation('arrow:user->server\nhighlight: database\nfadeIn cloud\ntotally bogus line\npulse:firewall');
    expect(steps).toEqual([
      { op: 'arrow', from: 'user', to: 'server' },
      { op: 'highlight', target: 'database' },
      { op: 'fadeIn', target: 'cloud' },
      { op: 'pulse', target: 'firewall' },
    ]);
  });

  it('every component id is a non-empty string and unique', () => {
    expect(new Set(VISUAL_COMPONENT_IDS).size).toBe(VISUAL_COMPONENT_IDS.length);
  });
});
