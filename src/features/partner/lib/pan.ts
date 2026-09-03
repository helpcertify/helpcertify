// PAN (India Permanent Account Number) rules for earning partners. Pure and
// framework-agnostic; api/auth.ts + api/admin.ts re-implement the format
// check and masking inline (no-shared-code-across-api convention) and this
// module is the tested spec. NO hashing here - that needs node:crypto and
// lives in the handlers; this module only defines the shape.

// AAAAA9999A - five letters, four digits, one letter. The 4th letter
// encodes holder type (P = individual), the 5th is the first char of the
// surname; we don't validate those semantics, only the structure (PRD 6:
// "validate the basic PAN structure server-side").
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export function normalizePan(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

export function isValidPanFormat(raw: string): boolean {
  return PAN_RE.test(normalizePan(raw));
}

// ABCDE1234F -> ABCDE****F  (first 5 + last 1 shown, PRD 6 example).
export function maskPan(raw: string): string {
  const p = normalizePan(raw);
  if (!PAN_RE.test(p)) return '****';
  return `${p.slice(0, 5)}****${p.slice(9)}`;
}

// Last 4 characters, for the masked-PAN-suffix search on the admin list
// (PRD 14.4). "ABCDE1234F" -> "234F".
export function panLast4(raw: string): string {
  const p = normalizePan(raw);
  return p.length >= 4 ? p.slice(-4) : p;
}

// A GSTIN carries the holder's PAN in positions 3-12 (0-indexed 2-11).
// 22 AAAAA0000A 1 Z 5  ->  PAN = AAAAA0000A
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;

export function normalizeGstin(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

export function isValidGstinFormat(raw: string): boolean {
  return GSTIN_RE.test(normalizeGstin(raw));
}

// Returns the PAN embedded in a GSTIN, or null if the GSTIN is malformed.
// Used to cross-check that a partner's GSTIN and PAN agree.
export function panFromGstin(raw: string): string | null {
  const g = normalizeGstin(raw);
  if (!GSTIN_RE.test(g)) return null;
  return g.slice(2, 12);
}

export type PartnerPayoutStatus = 'OK' | 'KYC_ACTION_REQUIRED' | 'PAYOUT_BLOCKED';

// A partner may only be included in a payout batch when fully cleared.
export function isPayoutEligible(status: PartnerPayoutStatus | undefined | null): boolean {
  return status === 'OK';
}
