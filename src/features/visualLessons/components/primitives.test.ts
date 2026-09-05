import { describe, it, expect } from 'vitest';
import { VISUAL_COMPONENT_IDS } from '../storyboard';
import { VISUAL_COMPONENTS, COMPONENT_LABELS } from './primitives';

describe('visual component registry', () => {
  it('has a renderer and a label for every VisualComponentId', () => {
    for (const id of VISUAL_COMPONENT_IDS) {
      expect(typeof VISUAL_COMPONENTS[id]).toBe('function');
      expect(COMPONENT_LABELS[id]).toBeTruthy();
    }
  });

  it('has no extra keys beyond VisualComponentId', () => {
    expect(Object.keys(VISUAL_COMPONENTS).sort()).toEqual([...VISUAL_COMPONENT_IDS].sort());
  });
});
