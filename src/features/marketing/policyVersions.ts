// Version identifier for each public policy document. A purchase-consent
// record (see api/checkout.ts, PurchaseConsentDoc) snapshots these at
// checkout time so we can always establish which wording a customer
// actually agreed to, even after the pages are later revised.
//
// Bump the relevant date string in the same commit that changes a policy
// page's substance. The server keeps its own copy of this object (api/
// checkout.ts / api/razorpay-webhook.ts) - this project's convention is no
// imports across api/*.ts or from src/, so the literal is duplicated there
// and that server copy is the authoritative one written to the record.
export const POLICY_VERSIONS = {
  terms: '2026-08-29',
  refund: '2026-08-29',
  privacy: '2026-08-29',
  support: '2026-08-29',
} as const;

export type PolicyVersions = typeof POLICY_VERSIONS;
