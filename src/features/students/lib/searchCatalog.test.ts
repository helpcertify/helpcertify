import { describe, it, expect } from 'vitest';
import { filterCatalog, totalResults } from './searchCatalog';

const groups = {
  courses: [
    { id: 'c1', title: 'Automation Testing with Selenium', category: 'Software Testing' },
    { id: 'c2', title: 'Cloud Security Fundamentals', category: 'AWS' },
  ],
  quizzes: [{ id: 'q1', title: 'CISM Full Mock Bank', category: 'ISACA' }],
  practiceTests: [{ id: 'p1', title: 'CISA Domain 2 Practice', category: 'ISACA' }],
  certifications: [
    { id: 'x1', name: 'CISM Certified Information Security Manager', provider: 'ISACA' },
    { id: 'x2', name: 'AWS Solutions Architect', provider: 'AWS' },
  ],
};

describe('filterCatalog', () => {
  it('matches a term case-insensitively across titles and cert names', () => {
    const r = filterCatalog(groups, 'cism');
    expect(r.quizzes.map((q) => q.id)).toEqual(['q1']);
    expect(r.certifications.map((x) => x.id)).toEqual(['x1']);
    expect(r.courses).toHaveLength(0);
  });

  it('an empty term returns everything', () => {
    expect(totalResults(filterCatalog(groups, ''))).toBe(6);
    expect(totalResults(filterCatalog(groups, '   '))).toBe(6);
  });

  it('filters by category on courses/quizzes/practice tests and by provider on certifications', () => {
    const r = filterCatalog(groups, '', 'ISACA');
    expect(r.quizzes.map((q) => q.id)).toEqual(['q1']);
    expect(r.practiceTests.map((p) => p.id)).toEqual(['p1']);
    expect(r.certifications.map((x) => x.id)).toEqual(['x1']);
    expect(r.courses).toHaveLength(0);
  });

  it('combines term and category', () => {
    const r = filterCatalog(groups, 'cloud', 'AWS');
    expect(r.courses.map((c) => c.id)).toEqual(['c2']);
    expect(totalResults(r)).toBe(1);
  });

  it('returns nothing when the term matches nothing', () => {
    expect(totalResults(filterCatalog(groups, 'kubernetes'))).toBe(0);
  });
});
