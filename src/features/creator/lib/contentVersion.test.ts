import { describe, it, expect } from 'vitest';
import { nextItemVersion, requiresReReview, preservesAttribution } from './contentVersion';

describe('nextItemVersion', () => {
  it('always increments, never below 2', () => {
    expect(nextItemVersion(1)).toBe(2);
    expect(nextItemVersion(4)).toBe(5);
    expect(nextItemVersion(0)).toBe(2);
    expect(nextItemVersion(2.9)).toBe(3);
  });
});

describe('requiresReReview', () => {
  it('a typo fix does not need re-review', () => {
    expect(requiresReReview('typo')).toBe(false);
  });
  it('any change to meaning needs re-review', () => {
    for (const c of ['clarification', 'answer_change', 'stem_rewrite', 'option_change'] as const) {
      expect(requiresReReview(c)).toBe(true);
    }
  });
});

describe('preservesAttribution', () => {
  const base = { creatorContractId: 'c1', partnerId: 'HCP9', submissionId: 's1' };
  it('true when contract / creator / submission are unchanged', () => {
    expect(preservesAttribution(base, { ...base })).toBe(true);
  });
  it('false if the update rewrites the contract, partner or source', () => {
    expect(preservesAttribution(base, { ...base, creatorContractId: 'c2' })).toBe(false);
    expect(preservesAttribution(base, { ...base, partnerId: 'HCP7' })).toBe(false);
    expect(preservesAttribution(base, { ...base, submissionId: 's2' })).toBe(false);
  });
});
