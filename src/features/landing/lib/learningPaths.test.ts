import { describe, it, expect } from 'vitest';
import { LEARNING_DOMAINS, LEARNING_PATH_EXAMPLES, type LearningLevel } from './learningPaths';

const VALID_LEVELS: LearningLevel[] = ['Foundation', 'Professional', 'Advanced'];

describe('learningPaths config', () => {
  it('has at least one domain, each non-empty', () => {
    expect(LEARNING_DOMAINS.length).toBeGreaterThan(0);
    for (const d of LEARNING_DOMAINS) expect(d.trim()).not.toBe('');
  });

  it('has at least one example, each with a valid level and non-empty fields', () => {
    expect(LEARNING_PATH_EXAMPLES.length).toBeGreaterThan(0);
    for (const p of LEARNING_PATH_EXAMPLES) {
      expect(p.id.trim()).not.toBe('');
      expect(p.domain.trim()).not.toBe('');
      expect(p.title.trim()).not.toBe('');
      expect(VALID_LEVELS).toContain(p.level);
    }
  });

  it('has unique ids', () => {
    const ids = LEARNING_PATH_EXAMPLES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every prerequisiteId, when set, points at a real example', () => {
    const ids = new Set(LEARNING_PATH_EXAMPLES.map((p) => p.id));
    for (const p of LEARNING_PATH_EXAMPLES) {
      if (p.prerequisiteId) expect(ids.has(p.prerequisiteId)).toBe(true);
    }
  });

  it('demonstrates at least one Professional or Advanced example, not only Foundation', () => {
    expect(LEARNING_PATH_EXAMPLES.some((p) => p.level !== 'Foundation')).toBe(true);
  });
});
