import { describe, it, expect } from 'vitest';
import {
  computeCommission,
  roundMinor,
  holdDaysFor,
  holdUntilMs,
  nextCommissionStatusOnRefund,
  isAutoReleasable,
} from './commission';

describe('roundMinor', () => {
  it('rounds half up', () => {
    expect(roundMinor(100.4)).toBe(100);
    expect(roundMinor(100.5)).toBe(101);
    expect(roundMinor(100.6)).toBe(101);
  });
});

describe('computeCommission', () => {
  const base = {
    subtotalExcludingTaxMinor: 1_500_000, // ₹15,000
    nonCommissionableDiscountMinor: 0,
    refundedBaseMinor: 0,
    excludedFeesMinor: 0,
    rateBasisPoints: 2000, // 20%
    maxCommissionMinor: null,
  };

  it('matches the PRD pilot example: 20% of ₹15,000 = ₹3,000', () => {
    const r = computeCommission(base);
    expect(r.eligibleBaseMinor).toBe(1_500_000);
    expect(r.grossCommissionMinor).toBe(300_000);
    expect(r.capped).toBe(false);
  });

  it('subtracts non-commissionable discount from the base', () => {
    const r = computeCommission({ ...base, nonCommissionableDiscountMinor: 500_000 });
    expect(r.eligibleBaseMinor).toBe(1_000_000);
    expect(r.grossCommissionMinor).toBe(200_000);
  });

  it('subtracts an already-refunded base portion', () => {
    const r = computeCommission({ ...base, refundedBaseMinor: 750_000 });
    expect(r.eligibleBaseMinor).toBe(750_000);
    expect(r.grossCommissionMinor).toBe(150_000);
  });

  it('never returns a negative base', () => {
    const r = computeCommission({ ...base, refundedBaseMinor: 9_999_999 });
    expect(r.eligibleBaseMinor).toBe(0);
    expect(r.grossCommissionMinor).toBe(0);
  });

  it('applies the max commission cap', () => {
    const r = computeCommission({ ...base, maxCommissionMinor: 250_000 });
    expect(r.grossCommissionMinor).toBe(250_000);
    expect(r.capped).toBe(true);
  });

  it('rounds half up on odd rates', () => {
    // 1234567 * 333 / 10000 = 41111.0811 -> 41111
    const r = computeCommission({ ...base, subtotalExcludingTaxMinor: 1_234_567, rateBasisPoints: 333 });
    expect(r.grossCommissionMinor).toBe(41_111);
  });
});

describe('holdDaysFor', () => {
  it('floors at 7 days', () => {
    expect(holdDaysFor(0)).toBe(7);
    expect(holdDaysFor(null)).toBe(7);
    expect(holdDaysFor(3)).toBe(7);
  });
  it('uses the refund window when longer', () => {
    expect(holdDaysFor(14)).toBe(14);
    expect(holdDaysFor(30)).toBe(30);
  });
});

describe('holdUntilMs', () => {
  it('adds whole days', () => {
    expect(holdUntilMs(0, 7)).toBe(7 * 86_400_000);
  });
});

describe('nextCommissionStatusOnRefund', () => {
  it('reverses commissions that have not been paid out', () => {
    expect(nextCommissionStatusOnRefund('PENDING_HOLD')).toBe('REVERSED');
    expect(nextCommissionStatusOnRefund('ON_HOLD')).toBe('REVERSED');
    expect(nextCommissionStatusOnRefund('PAYABLE')).toBe('REVERSED');
    expect(nextCommissionStatusOnRefund('APPROVED')).toBe('REVERSED');
  });
  it('makes an already-paid commission recoverable', () => {
    expect(nextCommissionStatusOnRefund('PAID')).toBe('RECOVERABLE');
    expect(nextCommissionStatusOnRefund('PROCESSING')).toBe('RECOVERABLE');
  });
  it('leaves terminal / unwound states alone', () => {
    expect(nextCommissionStatusOnRefund('REJECTED')).toBeNull();
    expect(nextCommissionStatusOnRefund('REVERSED')).toBeNull();
    expect(nextCommissionStatusOnRefund('RECOVERABLE')).toBeNull();
  });
});

describe('isAutoReleasable', () => {
  it('only auto-releases PENDING_HOLD', () => {
    expect(isAutoReleasable('PENDING_HOLD')).toBe(true);
    expect(isAutoReleasable('ON_HOLD')).toBe(false);
    expect(isAutoReleasable('PAYABLE')).toBe(false);
  });
});
