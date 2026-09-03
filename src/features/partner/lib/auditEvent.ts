// The redaction rule for auditEvents before/after snapshots. A security
// control (PRD 15): PAN, bank, UPI, tokens and full email addresses must
// never land in an audit doc. Pure + tested (auditEvent.test.ts); the api
// handlers call redactForAudit() on every before/after they write.

// Key names (case-insensitive, substring) whose values are dropped entirely.
const SENSITIVE_KEY_PARTS = [
  'pan',
  'aadhaar',
  'aadhar',
  'bank',
  'account',
  'ifsc',
  'upi',
  'vpa',
  'password',
  'secret',
  'token',
  'otp',
  'signature',
  'privatekey',
];

function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase();
  return SENSITIVE_KEY_PARTS.some((p) => k.includes(p));
}

// john.doe@example.com -> j***@example.com
export function maskEmail(value: string): string {
  const at = value.indexOf('@');
  if (at <= 0) return '***';
  return `${value[0]}***${value.slice(at)}`;
}

export function redactForAudit(input: unknown): unknown {
  if (input === null || typeof input !== 'object') {
    if (typeof input === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input)) return maskEmail(input);
    return input;
  }
  if (Array.isArray(input)) return input.map(redactForAudit);
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
    if (isSensitiveKey(key)) {
      out[key] = '[redacted]';
      continue;
    }
    if (/email/i.test(key) && typeof val === 'string') {
      out[key] = maskEmail(val);
      continue;
    }
    out[key] = redactForAudit(val);
  }
  return out;
}
