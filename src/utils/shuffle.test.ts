import { describe, it, expect } from 'vitest';
import { shuffle } from './shuffle';

describe('shuffle', () => {
  it('returns a permutation of the same elements and does not mutate the input', () => {
    const input = ['a', 'b', 'c', 'd', 'e'];
    const out = shuffle(input);
    expect(out).toHaveLength(5);
    expect([...out].sort()).toEqual([...input].sort());
    expect(input).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('is deterministic given a seeded rng', () => {
    let n = 0;
    const rng = () => [0.1, 0.9, 0.4, 0.2, 0.7][n++ % 5];
    expect(shuffle([1, 2, 3, 4, 5], rng)).toEqual(shuffle([1, 2, 3, 4, 5], (() => { let m = 0; return () => [0.1, 0.9, 0.4, 0.2, 0.7][m++ % 5]; })()));
  });

  it('handles 0 and 1 element', () => {
    expect(shuffle([])).toEqual([]);
    expect(shuffle([7])).toEqual([7]);
  });
});
