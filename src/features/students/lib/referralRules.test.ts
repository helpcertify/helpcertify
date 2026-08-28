import { describe, it, expect } from 'vitest';
import {
  isSelfReferral,
  isSameSignupIp,
  canLinkReferral,
  shouldSkipAlreadyProcessedOrder,
  computeCreditStatus,
  computeCreditApplicable,
  isWithinMonthlyLimit,
  nextStatusOnRefund,
} from './referralRules';

describe('isSelfReferral', () => {
  it('is true when the referrer and the new account are the same uid', () => {
    expect(isSelfReferral('uid1', 'uid1')).toBe(true);
  });

  it('is false for two different uids', () => {
    expect(isSelfReferral('uid1', 'uid2')).toBe(false);
  });
});

describe('canLinkReferral (duplicate-use guard)', () => {
  it('allows linking when no referral doc exists yet for this account', () => {
    expect(canLinkReferral(null)).toBe(true);
    expect(canLinkReferral(undefined)).toBe(true);
  });

  it('refuses a second link once a referral doc already exists, regardless of the code used', () => {
    expect(canLinkReferral({ referrerUid: 'someone-else', status: 'registered' })).toBe(false);
  });
});

describe('shouldSkipAlreadyProcessedOrder (webhook-retry idempotency guard)', () => {
  it('skips an order already marked paid - a retried webhook or duplicate client confirmation must not reprocess it', () => {
    expect(shouldSkipAlreadyProcessedOrder('paid')).toBe(true);
  });

  it('skips an already-refunded order too', () => {
    expect(shouldSkipAlreadyProcessedOrder('refunded')).toBe(true);
  });

  it('does not skip an order still awaiting payment', () => {
    expect(shouldSkipAlreadyProcessedOrder('created')).toBe(false);
    expect(shouldSkipAlreadyProcessedOrder('failed')).toBe(false);
  });
});

describe('isSameSignupIp', () => {
  it('flags a match when both accounts signed up from the same IP', () => {
    expect(isSameSignupIp('1.2.3.4', '1.2.3.4')).toBe(true);
  });

  it('does not flag two different IPs', () => {
    expect(isSameSignupIp('1.2.3.4', '5.6.7.8')).toBe(false);
  });

  it('never flags when either IP is missing (no signal to compare, not treated as suspicious)', () => {
    expect(isSameSignupIp(null, '1.2.3.4')).toBe(false);
    expect(isSameSignupIp('1.2.3.4', null)).toBe(false);
    expect(isSameSignupIp(undefined, undefined)).toBe(false);
  });
});

describe('computeCreditStatus', () => {
  const validationEndsAt = new Date(2026, 7, 8); // Aug 8
  const expiresAt = new Date(2026, 10, 6); // Nov 6 (90 days after Aug 8)

  it('is pending_validation before the validation period ends', () => {
    expect(computeCreditStatus({ validationEndsAt, expiresAt }, new Date(2026, 7, 5))).toBe('pending_validation');
  });

  it('is active once the validation period has ended but before expiry', () => {
    expect(computeCreditStatus({ validationEndsAt, expiresAt }, new Date(2026, 7, 8))).toBe('active');
    expect(computeCreditStatus({ validationEndsAt, expiresAt }, new Date(2026, 9, 1))).toBe('active');
  });

  it('is expired once past the expiry timestamp, even if validation had passed', () => {
    expect(computeCreditStatus({ validationEndsAt, expiresAt }, new Date(2026, 10, 6))).toBe('expired');
    expect(computeCreditStatus({ validationEndsAt, expiresAt }, new Date(2027, 0, 1))).toBe('expired');
  });
});

describe('computeCreditApplicable', () => {
  it('caps at maxPercent of the subtotal when more credit is available than that', () => {
    // 25% of 2000 = 500, but 1000 is available - capped at 500.
    expect(computeCreditApplicable(2000, 1000, 25)).toBe(500);
  });

  it('caps at the available balance when that is smaller than the percent cap', () => {
    // 25% of 2000 = 500, but only 100 is available - capped at 100.
    expect(computeCreditApplicable(2000, 100, 25)).toBe(100);
  });

  it('never exceeds the subtotal itself', () => {
    expect(computeCreditApplicable(50, 10000, 100)).toBe(50);
  });

  it('is 0 for a zero/negative subtotal, zero balance, or zero percent', () => {
    expect(computeCreditApplicable(0, 1000, 25)).toBe(0);
    expect(computeCreditApplicable(2000, 0, 25)).toBe(0);
    expect(computeCreditApplicable(2000, 1000, 0)).toBe(0);
  });
});

describe('isWithinMonthlyLimit', () => {
  it('is true strictly under the limit', () => {
    expect(isWithinMonthlyLimit(9, 10)).toBe(true);
  });

  it('is false at or over the limit', () => {
    expect(isWithinMonthlyLimit(10, 10)).toBe(false);
    expect(isWithinMonthlyLimit(11, 10)).toBe(false);
  });
});

describe('nextStatusOnRefund', () => {
  it('reverses a pending referral (credit not yet spendable, refunded before it ever became final)', () => {
    expect(nextStatusOnRefund('pending')).toBe('reversed');
  });

  it('reverses an already-rewarded referral (credit was spendable, now clawed back)', () => {
    expect(nextStatusOnRefund('rewarded')).toBe('reversed');
  });

  it('leaves every other status untouched - nothing to reverse', () => {
    const untouched: Array<Parameters<typeof nextStatusOnRefund>[0]> = [
      'invited',
      'registered',
      'purchased',
      'rejected',
      'reversed',
      'expired',
    ];
    for (const status of untouched) {
      expect(nextStatusOnRefund(status)).toBe(status);
    }
  });
});
