import { describe, it, expect } from 'vitest';
import { LEARNING_GOALS, GOAL_PILL_IDS } from './learningGoals';

describe('learningGoals config', () => {
  it('has at least one goal, each with a non-empty text/category/route', () => {
    expect(LEARNING_GOALS.length).toBeGreaterThan(0);
    for (const g of LEARNING_GOALS) {
      expect(g.id.trim()).not.toBe('');
      expect(g.category.trim()).not.toBe('');
      expect(g.text.trim()).not.toBe('');
      expect(g.route.trim()).not.toBe('');
    }
  });

  it('has unique ids', () => {
    const ids = LEARNING_GOALS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every pill id resolves to a real goal', () => {
    for (const id of GOAL_PILL_IDS) {
      expect(LEARNING_GOALS.some((g) => g.id === id)).toBe(true);
    }
  });
});
