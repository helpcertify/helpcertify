import { describe, it, expect } from 'vitest';
import { computeRatingBreakdown } from './ratingBreakdown';

describe('computeRatingBreakdown', () => {
  it('counts and percentages each star bucket from real ratings', () => {
    const rows = computeRatingBreakdown([{ rating: 5 }, { rating: 5 }, { rating: 4 }, { rating: 1 }]);
    expect(rows.find((r) => r.star === 5)).toEqual({ star: 5, count: 2, pct: 50 });
    expect(rows.find((r) => r.star === 4)).toEqual({ star: 4, count: 1, pct: 25 });
    expect(rows.find((r) => r.star === 1)).toEqual({ star: 1, count: 1, pct: 25 });
    expect(rows.find((r) => r.star === 3)?.count).toBe(0);
  });

  it('returns all-zero rows for no reviews', () => {
    const rows = computeRatingBreakdown([]);
    expect(rows.every((r) => r.count === 0 && r.pct === 0)).toBe(true);
  });

  it('rounds fractional ratings to the nearest star', () => {
    const rows = computeRatingBreakdown([{ rating: 4.6 }]);
    expect(rows.find((r) => r.star === 5)?.count).toBe(1);
  });

  it('orders rows from 5 stars down to 1', () => {
    const rows = computeRatingBreakdown([]);
    expect(rows.map((r) => r.star)).toEqual([5, 4, 3, 2, 1]);
  });
});
