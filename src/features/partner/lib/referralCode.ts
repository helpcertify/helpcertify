// Pure, framework-agnostic rules for partner referral codes - no Firestore
// or network calls, so directly unit-testable (see referralCode.test.ts).
// api/*.ts files can't import from src/ (see the no-shared-code-across-api
// convention), so this module is the tested canonical spec that the inline
// logic in api/auth.ts + api/admin.ts must match.

// Crockford-ish base32, no 0/O/1/I ambiguity - identical alphabet to
// api/auth.ts's generateReferralCode so partner and learner codes read the
// same way.
export const REFERRAL_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// "HCP" (HelpCertify Partner) + 6 chars. Distinct prefix from a learner
// Refer & Earn code (6 chars, no prefix) so the two namespaces never collide.
export function generatePartnerCode(randomBytes: (n: number) => Uint8Array): string {
  const bytes = randomBytes(6);
  let body = '';
  for (const b of bytes) body += REFERRAL_CODE_ALPHABET[b % REFERRAL_CODE_ALPHABET.length];
  return `HCP${body}`;
}

// The doc id in referralCodes/{...} is always the normalised form.
export function normalizeReferralCode(raw: string): string {
  return raw.trim().toUpperCase();
}

// A well-formed partner code: HCP + 6 alphabet chars. Anything else is
// rejected before a Firestore lookup (also stops a learner "?ref=THILAK20"
// from ever hitting the partner path).
const PARTNER_CODE_RE = new RegExp(`^HCP[${REFERRAL_CODE_ALPHABET}]{6}$`);
export function isValidPartnerCodeFormat(raw: string): boolean {
  return PARTNER_CODE_RE.test(normalizeReferralCode(raw));
}
