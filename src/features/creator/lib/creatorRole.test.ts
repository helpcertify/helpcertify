import { describe, it, expect } from 'vitest';
import {
  isValidCreatorRole,
  partnerRoleDocId,
  canApplyForRole,
  validateContractRate,
  previewEarningMinor,
  earningTypeFor,
} from './creatorRole';

describe('isValidCreatorRole', () => {
  it('accepts the four creator roles and nothing else', () => {
    expect(isValidCreatorRole('course_creator')).toBe(true);
    expect(isValidCreatorRole('reviewer')).toBe(true);
    expect(isValidCreatorRole('sales')).toBe(false);
    expect(isValidCreatorRole('admin')).toBe(false);
  });
});

describe('partnerRoleDocId', () => {
  it('is one row per partner per role', () => {
    expect(partnerRoleDocId('HCP123', 'reviewer')).toBe('HCP123__reviewer');
  });
});

describe('canApplyForRole', () => {
  it('allows a first application or a re-apply after rejection', () => {
    expect(canApplyForRole(null)).toBe(true);
    expect(canApplyForRole(undefined)).toBe(true);
    expect(canApplyForRole('REJECTED')).toBe(true);
  });
  it('blocks re-applying while a role is live', () => {
    expect(canApplyForRole('APPLIED')).toBe(false);
    expect(canApplyForRole('UNDER_REVIEW')).toBe(false);
    expect(canApplyForRole('APPROVED')).toBe(false);
    expect(canApplyForRole('SUSPENDED')).toBe(false);
  });
});

describe('validateContractRate', () => {
  it('requires a positive integer', () => {
    expect(validateContractRate('FIXED', 0).ok).toBe(false);
    expect(validateContractRate('FIXED', -100).ok).toBe(false);
    expect(validateContractRate('PER_ITEM', 12.5).ok).toBe(false);
    expect(validateContractRate('PER_ITEM', 5000).ok).toBe(true);
  });
  it('caps a fixed fee and a per-item rate', () => {
    expect(validateContractRate('FIXED', 6_000_000).ok).toBe(false);
    expect(validateContractRate('FIXED', 5_000_000).ok).toBe(true);
    expect(validateContractRate('PER_ITEM', 200_000).ok).toBe(false);
    expect(validateContractRate('REVIEW', 100_000).ok).toBe(true);
  });
});

describe('previewEarningMinor', () => {
  it('FIXED ignores the item count', () => {
    expect(previewEarningMinor('FIXED', 500_000, 999)).toBe(500_000);
  });
  it('PER_ITEM and REVIEW multiply', () => {
    expect(previewEarningMinor('PER_ITEM', 5000, 40)).toBe(200_000);
    expect(previewEarningMinor('REVIEW', 3000, 100)).toBe(300_000);
  });
  it('floors and clamps degenerate input', () => {
    expect(previewEarningMinor('PER_ITEM', 5000, 40.9)).toBe(200_000);
    expect(previewEarningMinor('PER_ITEM', 5000, -3)).toBe(0);
  });
});

describe('earningTypeFor', () => {
  it('maps model to earning type', () => {
    expect(earningTypeFor('FIXED')).toBe('CREATOR_FIXED_FEE');
    expect(earningTypeFor('PER_ITEM')).toBe('CREATOR_ITEM_FEE');
    expect(earningTypeFor('REVIEW')).toBe('REVIEWER_FEE');
  });
});
