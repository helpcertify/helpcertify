import { describe, it, expect } from 'vitest';
import { combinePayable } from './payoutBatch';

describe('combinePayable (sales commission + creator earnings in one run)', () => {
  it('sums commissions and earnings into one gross per partner', () => {
    const groups = combinePayable(
      [
        { id: 'c1', partnerId: 'p1', netPayableMinor: 30000, currency: 'INR' },
        { id: 'c2', partnerId: 'p1', netPayableMinor: 20000, currency: 'INR' },
      ],
      [
        { id: 'e1', partnerId: 'p1', netMinor: 15000, currency: 'INR' },
        { id: 'e2', partnerId: 'p2', netMinor: 60000, currency: 'INR' },
      ],
      50000,
    );
    const p1 = groups.find((g) => g.partnerId === 'p1')!;
    expect(p1.commissionIds).toEqual(['c1', 'c2']);
    expect(p1.earningIds).toEqual(['e1']);
    expect(p1.commissionMinor).toBe(50000);
    expect(p1.earningMinor).toBe(15000);
    expect(p1.grossMinor).toBe(65000);
    expect(p1.meetsMinimum).toBe(true);

    const p2 = groups.find((g) => g.partnerId === 'p2')!;
    expect(p2.commissionIds).toEqual([]);
    expect(p2.grossMinor).toBe(60000);
  });

  it('the batch total equals the sum of every included net line item (PRD 19)', () => {
    const commissions = [
      { id: 'c1', partnerId: 'p1', netPayableMinor: 12345, currency: 'INR' },
      { id: 'c2', partnerId: 'p2', netPayableMinor: 67890, currency: 'INR' },
    ];
    const earnings = [
      { id: 'e1', partnerId: 'p1', netMinor: 5000, currency: 'INR' },
      { id: 'e2', partnerId: 'p3', netMinor: 99999, currency: 'INR' },
    ];
    const groups = combinePayable(commissions, earnings, 0);
    const batchTotal = groups.reduce((t, g) => t + g.grossMinor, 0);
    const lineItemSum =
      commissions.reduce((t, c) => t + c.netPayableMinor, 0) + earnings.reduce((t, e) => t + e.netMinor, 0);
    expect(batchTotal).toBe(lineItemSum);
  });

  it('keeps different currencies in separate groups', () => {
    const groups = combinePayable(
      [{ id: 'c1', partnerId: 'p1', netPayableMinor: 60000, currency: 'INR' }],
      [{ id: 'e1', partnerId: 'p1', netMinor: 60000, currency: 'USD' }],
    );
    expect(groups).toHaveLength(2);
  });

  it('clamps negative line items to zero', () => {
    const [g] = combinePayable(
      [{ id: 'c1', partnerId: 'p1', netPayableMinor: 60000, currency: 'INR' }],
      [{ id: 'e1', partnerId: 'p1', netMinor: -500, currency: 'INR' }],
      0,
    );
    expect(g.grossMinor).toBe(60000);
  });
});
