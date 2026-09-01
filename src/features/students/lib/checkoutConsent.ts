// The purchase-consent acknowledgements recorded when a customer checks the
// single combined "I confirm and agree" box at checkout (shared by
// BuyNowModal and CartPage, enforced again server-side in
// api/checkout.ts's createOrder). The box maps to all four keys at once -
// they stay separate so the immutable purchase-consent record keeps
// itemising exactly what was agreed to; the combined wording lives in
// CheckoutConsent.tsx.
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

// What the single checkout acknowledgement sets when ticked.
export const ALL_CONSENT: CheckoutConsentState = {
  correctProduct: true,
  previewAcknowledged: true,
  policiesAccepted: true,
  technicalPolicyAcknowledged: true,
};

export function allConsentsGiven(s: CheckoutConsentState): boolean {
  return (
    s.correctProduct &&
    s.previewAcknowledged &&
    s.policiesAccepted &&
    s.technicalPolicyAcknowledged
  );
}
