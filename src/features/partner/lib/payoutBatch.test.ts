import { describe, it, expect } from 'vitest';
import {
  groupPayableByPartner,
  canApproveBatch,
  canMarkBatchPaid,
  canCancelBatch,
  maskTail,
  MIN_PAYOUT_MINOR,
} from './payoutBatch';

describe('groupPayableByPartner', () => {
  it('sums per partner and flags the minimum', () => {
    const groups = groupPayableByPartner([
      { id: 'a', partnerId: 'p1', netPayableMinor: 30000, currency: 'INR' },
      { id: 'b', partnerId: 'p1', netPayableMinor: 25000, currency: 'INR' },
      { id: 'c', partnerId: 'p2', netPayableMinor: 10000, currency: 'INR' },
    ]);
    const p1 = groups.find((g) => g.partnerId === 'p1')!;
    const p2 = groups.find((g) => g.partnerId === 'p2')!;
    expect(p1.grossMinor).toBe(55000);
    expect(p1.commissionIds).toEqual(['a', 'b']);
    expect(p1.meetsMinimum).toBe(true); // >= 50000
    expect(p2.grossMinor).toBe(10000);
    expect(p2.meetsMinimum).toBe(false);
  });

  it('keeps different currencies in separate groups', () => {
    const groups = groupPayableByPartner([
      { id: 'a', partnerId: 'p1', netPayableMinor: 60000, currency: 'INR' },
      { id: 'b', partnerId: 'p1', netPayableMinor: 60000, currency: 'USD' },
    ]);
    expect(groups).toHaveLength(2);
  });

  it('respects a custom minimum', () => {
    const [g] = groupPayableByPartner([{ id: 'a', partnerId: 'p1', netPayableMinor: 20000, currency: 'INR' }], 10000);
    expect(g.meetsMinimum).toBe(true);
  });

  it('defaults the minimum to ₹500', () => {
    expect(MIN_PAYOUT_MINOR).toBe(50000);
  });
});

describe('groupPayableByPartner - edge cases', () => {
  it('returns nothing for an empty list', () => {
    expect(groupPayableByPartner([])).toEqual([]);
  });

  it('clamps negative commission amounts to zero in the sum', () => {
    const [g] = groupPayableByPartner(
      [
        { id: 'a', partnerId: 'p1', netPayableMinor: 60000, currency: 'INR' },
        { id: 'b', partnerId: 'p1', netPayableMinor: -100, currency: 'INR' },
      ],
      10000,
    );
    expect(g.grossMinor).toBe(60000);
  });

  it('orders groups by amount descending', () => {
    const groups = groupPayableByPartner([
      { id: 'a', partnerId: 'small', netPayableMinor: 10000, currency: 'INR' },
      { id: 'b', partnerId: 'big', netPayableMinor: 90000, currency: 'INR' },
      { id: 'c', partnerId: 'mid', netPayableMinor: 50000, currency: 'INR' },
    ]);
    expect(groups.map((g) => g.partnerId)).toEqual(['big', 'mid', 'small']);
  });

  it('everyone below the minimum is carried (none meets minimum)', () => {
    const groups = groupPayableByPartner([
      { id: 'a', partnerId: 'p1', netPayableMinor: 40000, currency: 'INR' },
      { id: 'b', partnerId: 'p2', netPayableMinor: 30000, currency: 'INR' },
    ]);
    expect(groups.every((g) => !g.meetsMinimum)).toBe(true);
  });
});

describe('canApproveBatch', () => {
  it('blocks self-approval', () => {
    expect(canApproveBatch('DRAFT', 'u1', 'u1').ok).toBe(false);
  });
  it('allows a different approver on a draft', () => {
    expect(canApproveBatch('DRAFT', 'u1', 'u2').ok).toBe(true);
  });
  it('blocks approving a non-draft', () => {
    expect(canApproveBatch('APPROVED', 'u1', 'u2').ok).toBe(false);
  });
});

describe('canMarkBatchPaid', () => {
  it('requires an approved batch and a reference', () => {
    expect(canMarkBatchPaid('DRAFT', 'UTR123').ok).toBe(false);
    expect(canMarkBatchPaid('APPROVED', '   ').ok).toBe(false);
    expect(canMarkBatchPaid('APPROVED', 'UTR123').ok).toBe(true);
  });
});

describe('canCancelBatch', () => {
  it('cannot cancel a paid or already-cancelled batch', () => {
    expect(canCancelBatch('PAID').ok).toBe(false);
    expect(canCancelBatch('CANCELLED').ok).toBe(false);
    expect(canCancelBatch('DRAFT').ok).toBe(true);
    expect(canCancelBatch('APPROVED').ok).toBe(true);
  });
});

describe('maskTail', () => {
  it('keeps the last 4 and masks the rest', () => {
    expect(maskTail('123456789012')).toBe('••••••9012');
    expect(maskTail('name@okbank')).toBe('••••••bank');
    expect(maskTail('1234')).toBe('••••');
    expect(maskTail(null)).toBeNull();
    expect(maskTail('')).toBeNull();
  });
});
