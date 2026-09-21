import { describe, it, expect } from 'vitest';
import { pickRelatedItems, type RelatableItem } from './relatedItems';

const item = (over: Partial<RelatableItem> & { id: string; itemType: RelatableItem['itemType'] }): RelatableItem => ({
  title: over.id,
  category: 'Cybersecurity',
  skillLevel: 'Intermediate',
  ratingAvg: 0,
  ratingCount: 0,
  price: 999,
  originalPrice: null,
  currency: 'INR',
  ...over,
});

describe('pickRelatedItems', () => {
  const anchor = { id: 'anchor', itemType: 'quiz' as const, category: 'Cybersecurity', skillLevel: 'Intermediate' };
  const candidates = [
    item({ id: 'anchor', itemType: 'quiz' }), // the anchor itself
    item({ id: 'sec-adv', itemType: 'practiceTest', skillLevel: 'Advanced', ratingCount: 3 }),
    item({ id: 'sec-int', itemType: 'course', skillLevel: 'Intermediate', ratingCount: 10 }),
    item({ id: 'cloud', itemType: 'quiz', category: 'Cloud', ratingCount: 999 }),
    item({ id: 'owned', itemType: 'quiz', ratingCount: 500 }),
  ];

  it('excludes the anchor itself', () => {
    const r = pickRelatedItems(anchor, candidates, new Set());
    expect(r.map((x) => x.id)).not.toContain('anchor');
  });

  it('only returns items in the same category', () => {
    const r = pickRelatedItems(anchor, candidates, new Set());
    expect(r.map((x) => x.id)).not.toContain('cloud');
  });

  it('excludes already-owned items', () => {
    const r = pickRelatedItems(anchor, candidates, new Set(['quiz_owned']));
    expect(r.map((x) => x.id)).not.toContain('owned');
  });

  it('prefers matching skill level, then popularity', () => {
    const r = pickRelatedItems(anchor, candidates, new Set(['quiz_owned']));
    expect(r[0].id).toBe('sec-int');
  });

  it('respects the limit', () => {
    const r = pickRelatedItems(anchor, candidates, new Set(), 1);
    expect(r).toHaveLength(1);
  });
});
