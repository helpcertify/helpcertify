import { describe, it, expect } from 'vitest';
import { isLessonUnlocked } from './lessonAccess';

describe('isLessonUnlocked', () => {
  it('unlocks every lesson for an owner, regardless of order', () => {
    expect(isLessonUnlocked(0, true, 1)).toBe(true);
    expect(isLessonUnlocked(9, true, 1)).toBe(true);
  });

  it('unlocks a lesson within the preview count for a non-owner', () => {
    expect(isLessonUnlocked(0, false, 2)).toBe(true);
    expect(isLessonUnlocked(1, false, 2)).toBe(true);
  });

  it('locks a lesson beyond the preview count for a non-owner', () => {
    expect(isLessonUnlocked(2, false, 2)).toBe(false);
    expect(isLessonUnlocked(5, false, 2)).toBe(false);
  });

  it('locks exactly at the previewLessonCount boundary (order is 0-indexed, preview count is a count)', () => {
    expect(isLessonUnlocked(2, false, 2)).toBe(false);
    expect(isLessonUnlocked(1, false, 2)).toBe(true);
  });

  it('locks everything for a non-owner when previewLessonCount is 0', () => {
    expect(isLessonUnlocked(0, false, 0)).toBe(false);
  });
});
