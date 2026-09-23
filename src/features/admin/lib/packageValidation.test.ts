import { describe, it, expect } from 'vitest';
import {
  isPriceNonNegative,
  isOfferPriceValid,
  isOfferWindowValid,
  isValidityDaysValid,
  isCountNonNegative,
  hasPublishablePrice,
  hasEntitlement,
  isAccessibleCountWithinBank,
  isDuplicatePackageName,
  isDisplayOrderValid,
  canPublishPackage,
} from './packageValidation';

describe('isPriceNonNegative', () => {
  it('rejects a negative price', () => expect(isPriceNonNegative(-1)).toBe(false));
  it('allows zero and positive prices', () => {
    expect(isPriceNonNegative(0)).toBe(true);
    expect(isPriceNonNegative(199900)).toBe(true);
  });
});

describe('isOfferPriceValid', () => {
  it('allows no offer at all', () => expect(isOfferPriceValid(null, 100000)).toBe(true));
  it('rejects a negative offer price', () => expect(isOfferPriceValid(-1, 100000)).toBe(false));
  it('rejects an offer price above the regular price', () => expect(isOfferPriceValid(150000, 100000)).toBe(false));
  it('allows an offer price at or below the regular price', () => {
    expect(isOfferPriceValid(100000, 100000)).toBe(true);
    expect(isOfferPriceValid(50000, 100000)).toBe(true);
  });
});

describe('isOfferWindowValid', () => {
  it('allows no window configured', () => expect(isOfferWindowValid(null, null)).toBe(true));
  it('rejects an end date at or before the start date', () => {
    const start = new Date('2026-01-01');
    expect(isOfferWindowValid(start, new Date('2026-01-01'))).toBe(false);
    expect(isOfferWindowValid(start, new Date('2025-12-31'))).toBe(false);
  });
  it('allows an end date after the start date', () => {
    expect(isOfferWindowValid(new Date('2026-01-01'), new Date('2026-01-31'))).toBe(true);
  });
});

describe('isValidityDaysValid', () => {
  it('rejects zero or negative validity', () => {
    expect(isValidityDaysValid(0)).toBe(false);
    expect(isValidityDaysValid(-5)).toBe(false);
  });
  it('allows a positive validity', () => expect(isValidityDaysValid(180)).toBe(true));
});

describe('isCountNonNegative', () => {
  it('rejects negative counts', () => expect(isCountNonNegative(-1)).toBe(false));
  it('allows zero and positive counts', () => expect(isCountNonNegative(0)).toBe(true));
});

describe('hasPublishablePrice', () => {
  it('requires a positive selling price unless marked Free', () => {
    expect(hasPublishablePrice(0, false)).toBe(false);
    expect(hasPublishablePrice(199900, false)).toBe(true);
  });
  it('a Free package publishes without a price', () => expect(hasPublishablePrice(0, true)).toBe(true));
});

describe('hasEntitlement', () => {
  it('rejects a package with no included quizzes or practice tests', () => expect(hasEntitlement([], [])).toBe(false));
  it('allows at least one included quiz or practice test', () => {
    expect(hasEntitlement(['q1'], [])).toBe(true);
    expect(hasEntitlement([], ['t1'])).toBe(true);
  });
});

describe('isAccessibleCountWithinBank', () => {
  it('rejects promising more questions than the bank actually has', () => expect(isAccessibleCountWithinBank(1500, 900)).toBe(false));
  it('allows a count at or below the eligible bank size', () => {
    expect(isAccessibleCountWithinBank(900, 900)).toBe(true);
    expect(isAccessibleCountWithinBank(500, 900)).toBe(true);
  });
});

describe('isDuplicatePackageName', () => {
  it('flags a case-insensitive duplicate name', () => {
    expect(isDuplicatePackageName('complete', ['Complete', 'Mock Exams'])).toBe(true);
  });
  it('allows a name that does not collide', () => {
    expect(isDuplicatePackageName('Practice Questions', ['Complete', 'Mock Exams'])).toBe(false);
  });
  it('excludes the package being edited from the collision check', () => {
    expect(isDuplicatePackageName('Complete', ['Complete', 'Mock Exams'], 'pkg1', ['pkg1', 'pkg2'])).toBe(false);
  });
});

describe('isDisplayOrderValid', () => {
  it('rejects a negative or non-integer order', () => {
    expect(isDisplayOrderValid(-1)).toBe(false);
    expect(isDisplayOrderValid(1.5)).toBe(false);
  });
  it('allows zero and positive integers', () => expect(isDisplayOrderValid(0)).toBe(true));
});

describe('canPublishPackage', () => {
  it('blocks publish when the parent certification is not published', () => {
    expect(canPublishPackage({ certificationPublished: false, hasEntitlement: true, hasPublishablePrice: true })).toBe(false);
  });
  it('blocks publish without an entitlement or a valid price', () => {
    expect(canPublishPackage({ certificationPublished: true, hasEntitlement: false, hasPublishablePrice: true })).toBe(false);
    expect(canPublishPackage({ certificationPublished: true, hasEntitlement: true, hasPublishablePrice: false })).toBe(false);
  });
  it('allows publish once every condition is met', () => {
    expect(canPublishPackage({ certificationPublished: true, hasEntitlement: true, hasPublishablePrice: true })).toBe(true);
  });
});
