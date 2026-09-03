import { describe, it, expect } from 'vitest';
import {
  computeEarning,
  holdDaysForCreator,
  holdUntilMs,
  earningDocId,
  reversalTargetStatus,
  CREATOR_HOLD_DAYS_DEFAULT,
} from './creatorEarnings';

describe('computeEarning', () => {
  it('FIXED pays the whole rate once, ignoring quantity', () => {
    const r = computeEarning({ model: 'FIXED', rateMinor: 500_000, quantity: 40 });
    expect(r).toMatchObject({ type: 'CREATOR_FIXED_FEE', qty: 1, grossMinor: 500_000, skip: false });
  });
  it('FIXED is skipped when already paid for the assignment', () => {
    expect(computeEarning({ model: 'FIXED', rateMinor: 500_000, quantity: 1, fixedAlreadyPaid: true }).skip).toBe(true);
  });
  it('PER_ITEM multiplies rate by accepted count', () => {
    const r = computeEarning({ model: 'PER_ITEM', rateMinor: 5000, quantity: 40 });
    expect(r).toMatchObject({ type: 'CREATOR_ITEM_FEE', qty: 40, grossMinor: 200_000, skip: false });
  });
  it('REVIEW produces a reviewer fee', () => {
    const r = computeEarning({ model: 'REVIEW', rateMinor: 3000, quantity: 40 });
    expect(r).toMatchObject({ type: 'REVIEWER_FEE', grossMinor: 120_000 });
  });
  it('skips zero-quantity or zero-rate', () => {
    expect(computeEarning({ model: 'PER_ITEM', rateMinor: 5000, quantity: 0 }).skip).toBe(true);
    expect(computeEarning({ model: 'PER_ITEM', rateMinor: 0, quantity: 10 }).skip).toBe(true);
  });
  it('floors fractional inputs', () => {
    expect(computeEarning({ model: 'PER_ITEM', rateMinor: 5000.9, quantity: 40.9 }).grossMinor).toBe(200_000);
  });
});

describe('holdDaysForCreator', () => {
  it('defaults to 14', () => {
    expect(holdDaysForCreator(null)).toBe(CREATOR_HOLD_DAYS_DEFAULT);
    expect(holdDaysForCreator(0)).toBe(14);
    expect(holdDaysForCreator(21)).toBe(21);
  });
});

describe('holdUntilMs', () => {
  it('adds whole days', () => {
    expect(holdUntilMs(0, 14)).toBe(14 * 86_400_000);
  });
});

describe('earningDocId', () => {
  it('is idempotent per source + partner', () => {
    expect(earningDocId('submission', 'sub1', 'HCP9')).toBe('submission_sub1_HCP9');
    expect(earningDocId('assignment', 'a1', 'HCP9')).toBe('assignment_a1_HCP9');
  });
});

describe('reversalTargetStatus', () => {
  it('reverses unpaid, recovers paid, ignores terminal', () => {
    expect(reversalTargetStatus('PENDING_HOLD')).toBe('REVERSED');
    expect(reversalTargetStatus('PAYABLE')).toBe('REVERSED');
    expect(reversalTargetStatus('PAID')).toBe('RECOVERABLE');
    expect(reversalTargetStatus('PROCESSING')).toBe('RECOVERABLE');
    expect(reversalTargetStatus('REVERSED')).toBeNull();
  });
});
