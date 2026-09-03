// The paymentEvents/{id} doc-id format, shared (by convention, not import)
// between api/razorpay-webhook.ts and api/checkout.ts so a webhook delivery
// and the client verify for the same payment collapse onto ONE dedup doc
// (PRD 15/17: duplicate webhook idempotency).

/** Doc id for a Razorpay webhook delivery. Prefers the stable
 * x-razorpay-event-id; falls back to the payment id so a delivery that
 * somehow lacks the header still dedups against the client path. */
export function webhookEventKey(razorpayEventId: string | null | undefined, razorpayPaymentId: string): string {
  const id = (razorpayEventId ?? '').trim();
  return id ? id : `pay_${razorpayPaymentId}`;
}

/** Doc id for the client-side verifyPayment call. Always keyed by the
 * payment id, which is the same fallback the webhook uses. */
export function clientEventKey(razorpayPaymentId: string): string {
  return `pay_${razorpayPaymentId}`;
}
