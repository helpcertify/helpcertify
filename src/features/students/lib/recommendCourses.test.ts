import { describe, it, expect } from 'vitest';
import { recommendCourses, type RecommendableCourse } from './recommendCourses';

const c = (over: Partial<RecommendableCourse> & { id: string }): RecommendableCourse => ({
  title: over.id,
  category: 'General',
  skillLevel: 'Intermediate',
  ratingAvg: 0,
  ratingCount: 0,
  ...over,
});

describe('recommendCourses', () => {
  const courses = [
    c({ id: 'sec-adv', category: 'Cybersecurity', skillLevel: 'Advanced', ratingCount: 3 }),
    c({ id: 'sec-beg', category: 'Cybersecurity', skillLevel: 'Beginner', ratingCount: 1 }),
    c({ id: 'cloud', category: 'Cloud', skillLevel: 'Intermediate', ratingCount: 50 }),
    c({ id: 'owned', category: 'Cybersecurity', skillLevel: 'Intermediate', ratingCount: 99 }),
  ];

  it('ranks category matches ahead of non-matches', () => {
    const r = recommendCourses(['Cybersecurity'], courses, new Set(), undefined, 10);
    expect(r[0].category).toBe('Cybersecurity');
    expect(r[r.length - 1].id).toBe('cloud'); // non-match sinks to the bottom
  });

  it('excludes owned courses', () => {
    const r = recommendCourses(['Cybersecurity'], courses, new Set(['owned']));
    expect(r.map((x) => x.id)).not.toContain('owned');
  });

  it('prefers skill-level proximity within a category', () => {
    const r = recommendCourses(['Cybersecurity'], courses, new Set(), 'Advanced');
    expect(r[0].id).toBe('sec-adv');
  });

  it('respects the limit', () => {
    expect(recommendCourses([], courses, new Set(), undefined, 2)).toHaveLength(2);
  });
});
