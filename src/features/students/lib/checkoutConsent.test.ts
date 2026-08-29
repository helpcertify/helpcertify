import { describe, expect, it } from 'vitest';
import { allConsentsGiven, EMPTY_CONSENT, type CheckoutConsentState } from './checkoutConsent';

const KEYS: (keyof CheckoutConsentState)[] = [
  'correctProduct',
  'previewAcknowledged',
  'policiesAccepted',
  'technicalPolicyAcknowledged',
];

describe('allConsentsGiven', () => {
  it('is false for the empty state', () => {
    expect(allConsentsGiven(EMPTY_CONSENT)).toBe(false);
  });

  it('is false when any single box is unchecked', () => {
    for (const missing of KEYS) {
      const s = { ...EMPTY_CONSENT } as CheckoutConsentState;
      for (const k of KEYS) s[k] = k !== missing;
      expect(allConsentsGiven(s)).toBe(false);
    }
  });

  it('is true only when all four are checked', () => {
    expect(
      allConsentsGiven({
        correctProduct: true,
        previewAcknowledged: true,
        policiesAccepted: true,
        technicalPolicyAcknowledged: true,
      })
    ).toBe(true);
  });
});
