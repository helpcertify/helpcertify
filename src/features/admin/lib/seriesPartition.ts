// Pure helpers for splitting one uploaded question pool into practice
// batches and mock-exam batches. Framework-agnostic and unit-tested
// (seriesPartition.test.ts). api/content-admin.ts's createBatchedSeries
// re-implements the same two ranges inline (no cross-file imports across
// api/*.ts) - this file is the tested spec for what that must do.

export interface BatchRange {
  /** 1-based batch number, shown to the learner as "Practice Exam <index>". */
  index: number;
  /** Inclusive-exclusive slice bounds into the ordered question pool. */
  start: number;
  end: number;
  size: number;
}

/** Contiguous, non-overlapping slices of `total` questions, `batchSize`
 *  each, covering every question - the last slice is short when `total`
 *  isn't a multiple of `batchSize`. Returns [] for a non-positive pool. */
export function practiceBatches(total: number, batchSize: number): BatchRange[] {
  if (total <= 0 || batchSize <= 0) return [];
  const out: BatchRange[] = [];
  for (let start = 0, index = 1; start < total; start += batchSize, index++) {
    const end = Math.min(start + batchSize, total);
    out.push({ index, start, end, size: end - start });
  }
  return out;
}

/** Up to `count` non-overlapping slices of `size` each, taken from the
 *  front of the pool. Stops early (and shrinks the last slice) when the
 *  pool runs out, so a 30-question upload with count 5 / size 150 yields a
 *  single 30-question mock rather than five empty ones. */
export function mockBatches(total: number, count: number, size: number): BatchRange[] {
  if (total <= 0 || count <= 0 || size <= 0) return [];
  const out: BatchRange[] = [];
  for (let index = 1, start = 0; index <= count && start < total; index++, start += size) {
    const end = Math.min(start + size, total);
    out.push({ index, start, end, size: end - start });
  }
  return out;
}
