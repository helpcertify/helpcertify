// The four mandatory purchase-consent acknowledgements a customer must
// tick before the Pay button unlocks (shared by BuyNowModal and CartPage,
// enforced again server-side in api/checkout.ts's createOrder). None are
// pre-selected; the exact wording lives in CheckoutConsent.tsx and is
// snapshotted into the purchase-consent record by key.
export interface CheckoutConsentState {
  /** Reviewed the selected certification/product and confirms it is correct. */
  correctProduct: boolean;
  /** Understands a free preview is available to evaluate before purchase. */
  previewAcknowledged: boolean;
  /** Has read and agrees to Terms, Refund & Cancellation, and Privacy policies. */
  policiesAccepted: boolean;
  /** Understands technical issues are investigated/resolved first and do not
   *  automatically qualify for a refund. */
  technicalPolicyAcknowledged: boolean;
}

export const EMPTY_CONSENT: CheckoutConsentState = {
  correctProduct: false,
  previewAcknowledged: false,
  policiesAccepted: false,
  technicalPolicyAcknowledged: false,
};

export function allConsentsGiven(s: CheckoutConsentState): boolean {
  return (
    s.correctProduct &&
    s.previewAcknowledged &&
    s.policiesAccepted &&
    s.technicalPolicyAcknowledged
  );
}
