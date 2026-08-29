import { describe, it, expect } from 'vitest';
import { computeOfferStatus, effectivePrice, offersOverlap } from './offerStatus';

const now = new Date('2026-06-15T00:00:00Z');

describe('computeOfferStatus', () => {
  it('is "none" when no offer is configured at all', () => {
    expect(computeOfferStatus({ offerPrice: null, offerStart: null, offerEnd: null, offerCancelledAt: null }, now)).toBe('none');
  });

  it('is "cancelled" once offerCancelledAt is set, regardless of the window', () => {
    expect(
      computeOfferStatus(
        {
          offerPrice: 199900,
          offerStart: new Date('2026-06-01'),
          offerEnd: new Date('2026-06-30'),
          offerCancelledAt: new Date('2026-06-10'),
        },
        now
      )
    ).toBe('cancelled');
  });

  it('is "scheduled" before the offer window starts', () => {
    expect(
      computeOfferStatus(
        { offerPrice: 199900, offerStart: new Date('2026-07-01'), offerEnd: new Date('2026-07-31'), offerCancelledAt: null },
        now
      )
    ).toBe('scheduled');
  });

  it('is "active" strictly inside the offer window', () => {
    expect(
      computeOfferStatus(
        { offerPrice: 199900, offerStart: new Date('2026-06-01'), offerEnd: new Date('2026-06-30'), offerCancelledAt: null },
        now
      )
    ).toBe('active');
  });

  it('is "expired" after the offer window ends', () => {
    expect(
      computeOfferStatus(
        { offerPrice: 199900, offerStart: new Date('2026-05-01'), offerEnd: new Date('2026-05-31'), offerCancelledAt: null },
        now
      )
    ).toBe('expired');
  });
});

describe('effectivePrice', () => {
  it('is the offer price while the offer is active', () => {
    const pkg = {
      sellingPrice: 999900,
      offerPrice: 799900,
      offerStart: new Date('2026-06-01'),
      offerEnd: new Date('2026-06-30'),
      offerCancelledAt: null,
    };
    expect(effectivePrice(pkg, now)).toBe(799900);
  });

  it('falls back to the selling price when there is no active offer', () => {
    const pkg = { sellingPrice: 999900, offerPrice: null, offerStart: null, offerEnd: null, offerCancelledAt: null };
    expect(effectivePrice(pkg, now)).toBe(999900);
  });
});

describe('offersOverlap', () => {
  it('flags two windows that overlap', () => {
    const a = { offerStart: new Date('2026-06-01'), offerEnd: new Date('2026-06-15') };
    const b = { offerStart: new Date('2026-06-10'), offerEnd: new Date('2026-06-20') };
    expect(offersOverlap(a, b)).toBe(true);
  });

  it('allows two windows that do not overlap', () => {
    const a = { offerStart: new Date('2026-06-01'), offerEnd: new Date('2026-06-15') };
    const b = { offerStart: new Date('2026-06-15'), offerEnd: new Date('2026-06-30') };
    expect(offersOverlap(a, b)).toBe(false);
  });
});
