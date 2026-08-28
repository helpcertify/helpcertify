// Pure, framework-agnostic rules for the Refer & Earn program - no
// Firestore/network calls, so these are directly unit-testable (see
// referralRules.test.ts), the same way studyPlan.ts's calculations are.
// api/*.ts files re-implement these same short rules inline rather than
// importing this module - no cross-file imports across api/*.ts, per this
// repo's existing convention (see api/auth.ts's header comment) - so this
// file is the tested, canonical spec for what that inline logic must do.

export function isSelfReferral(referrerUid: string, newUid: string): boolean {
  return referrerUid === newUid;
}

// A referral can only ever be created once per referee - the doc id *is*
// the referee's own uid (referrals/{refereeUid}), so "does one already
// exist" is the entire duplicate-use guard; a second code entered by the
// same account is never linked, regardless of whether it's a different
// code or the same one.
export function canLinkReferral(existingReferralDoc: unknown): boolean {
  return existingReferralDoc == null;
}

// The same guard finalizeOrder already uses to stay idempotent against a
// payment-webhook retry or a duplicate client confirmation landing twice
// for the same order - anything already 'paid' (or beyond) must never be
// processed a second time.
export function shouldSkipAlreadyProcessedOrder(orderStatus: string): boolean {
  return orderStatus === 'paid' || orderStatus === 'refunded';
}

// Never blocks on missing data - a signup with no captured IP (or a
// referrer predating this field) just can't be compared, not treated as
// suspicious by default.
export function isSameSignupIp(referrerSignupIp: string | null | undefined, newSignupIp: string | null | undefined): boolean {
  if (!referrerSignupIp || !newSignupIp) return false;
  return referrerSignupIp === newSignupIp;
}

export type CreditStatus = 'pending_validation' | 'active' | 'expired';

// Whole-status classification from timestamps alone. 'depleted' (spent to
// zero) and 'reversed' (refund clawback) are set explicitly by whoever
// spends/reverses an entry - this only decides the two passive,
// time-based transitions every entry goes through on its own.
export function computeCreditStatus(entry: { validationEndsAt: Date; expiresAt: Date }, now: Date): CreditStatus {
  if (now.getTime() >= entry.expiresAt.getTime()) return 'expired';
  if (now.getTime() >= entry.validationEndsAt.getTime()) return 'active';
  return 'pending_validation';
}

// How much of a purchase an available credit balance can actually cover -
// capped at both maxPercent of the subtotal and whatever's actually
// available, whichever is smaller. Never negative, never more than the
// subtotal itself.
export function computeCreditApplicable(subtotalMinor: number, availableMinor: number, maxPercent: number): number {
  if (subtotalMinor <= 0 || availableMinor <= 0 || maxPercent <= 0) return 0;
  const cap = Math.floor((subtotalMinor * maxPercent) / 100);
  return Math.max(0, Math.min(cap, availableMinor, subtotalMinor));
}

export function isWithinMonthlyLimit(existingGrantsThisMonth: number, limit: number): boolean {
  return existingGrantsThisMonth < limit;
}

export type ReferralStatus =
  | 'invited'
  | 'registered'
  | 'purchased'
  | 'pending'
  | 'rewarded'
  | 'rejected'
  | 'reversed'
  | 'expired';

// Only a referral that actually granted (or was about to grant) a
// referrer benefit is reversible on refund - anything else (never
// purchased, or already rejected/reversed/expired) is left as-is; a
// refund on an order that was never anyone's qualifying purchase simply
// has nothing referral-related to reverse.
export function nextStatusOnRefund(currentStatus: ReferralStatus): ReferralStatus {
  if (currentStatus === 'pending' || currentStatus === 'rewarded') return 'reversed';
  return currentStatus;
}
