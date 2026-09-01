import { describe, it, expect } from 'vitest';
import { deriveMockBlueprint, mockConfigStatus } from './deriveMockBlueprint';

describe('deriveMockBlueprint', () => {
  it('splits proportionally and sums exactly to the total', () => {
    const { domains } = deriveMockBlueprint({
      byDomain: { A: 300, B: 200, C: 100 }, // 50/33.3/16.7
      totalQuestions: 150,
      durationMinutes: 240,
    });
    expect(domains.map((d) => d.domain)).toEqual(['A', 'B', 'C']); // sorted by share
    expect(domains.reduce((s, d) => s + d.questionCount, 0)).toBe(150);
    expect(domains.reduce((s, d) => s + d.percent, 0)).toBe(100);
    expect(domains[0].questionCount).toBe(75);
  });

  it('handles indivisible splits without drift', () => {
    const { domains } = deriveMockBlueprint({ byDomain: { A: 1, B: 1, C: 1 }, totalQuestions: 100, durationMinutes: 60 });
    expect(domains.reduce((s, d) => s + d.questionCount, 0)).toBe(100);
    expect(domains.reduce((s, d) => s + d.percent, 0)).toBe(100);
  });

  it('returns no domains when the bank has no tags', () => {
    expect(deriveMockBlueprint({ byDomain: {}, totalQuestions: 150, durationMinutes: 240 }).domains).toEqual([]);
  });
});

describe('mockConfigStatus', () => {
  const derived = deriveMockBlueprint({ byDomain: { A: 300, B: 200 }, totalQuestions: 100, durationMinutes: 120 });

  it('is ready when every domain can supply enough eligible questions', () => {
    expect(mockConfigStatus(derived, { A: 300, B: 200 })).toBe('ready');
  });
  it('needs attention when a domain is short', () => {
    expect(mockConfigStatus(derived, { A: 10, B: 200 })).toBe('needs_attention');
  });
  it('needs attention when the bank has no domain tags', () => {
    const empty = deriveMockBlueprint({ byDomain: {}, totalQuestions: 100, durationMinutes: 120 });
    expect(mockConfigStatus(empty, {})).toBe('needs_attention');
  });
});
