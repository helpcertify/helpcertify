import { describe, it, expect } from 'vitest';
import { practiceBatches, mockBatches } from './seriesPartition';

describe('practiceBatches', () => {
  it('splits an exact multiple into equal batches covering everything', () => {
    const b = practiceBatches(300, 150);
    expect(b.map((x) => x.size)).toEqual([150, 150]);
    expect(b[0]).toMatchObject({ index: 1, start: 0, end: 150 });
    expect(b[1]).toMatchObject({ index: 2, start: 150, end: 300 });
  });

  it('makes the last batch short and still covers the whole pool', () => {
    expect(practiceBatches(1500, 150)).toHaveLength(10);
    const b2 = practiceBatches(1487, 150);
    expect(b2).toHaveLength(10);
    expect(b2[9].size).toBe(137);
    expect(b2.reduce((s, x) => s + x.size, 0)).toBe(1487);
    // no overlap
    for (let i = 1; i < b2.length; i++) expect(b2[i].start).toBe(b2[i - 1].end);
  });

  it('returns nothing for an empty pool', () => {
    expect(practiceBatches(0, 150)).toEqual([]);
  });
});

describe('mockBatches', () => {
  it('takes 5 non-overlapping slices from the front', () => {
    const m = mockBatches(1500, 5, 150);
    expect(m).toHaveLength(5);
    expect(m[4]).toMatchObject({ index: 5, start: 600, end: 750, size: 150 });
    for (let i = 1; i < m.length; i++) expect(m[i].start).toBe(m[i - 1].end);
  });

  it('stops early and shrinks when the pool is smaller than count * size', () => {
    const m = mockBatches(30, 5, 150);
    expect(m).toHaveLength(1);
    expect(m[0].size).toBe(30);
  });

  it('yields exactly `count` when the pool is big enough', () => {
    expect(mockBatches(800, 5, 150)).toHaveLength(5);
  });
});
