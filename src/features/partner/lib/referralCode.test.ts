import { describe, it, expect } from 'vitest';
import {
  generatePartnerCode,
  normalizeReferralCode,
  isValidPartnerCodeFormat,
  REFERRAL_CODE_ALPHABET,
} from './referralCode';

const fixedBytes = (n: number) => new Uint8Array(Array.from({ length: n }, (_, i) => i));

describe('generatePartnerCode', () => {
  it('is HCP + 6 alphabet chars', () => {
    const code = generatePartnerCode(fixedBytes);
    expect(code).toMatch(/^HCP[A-Z2-9]{6}$/);
    expect(code.length).toBe(9);
    for (const ch of code.slice(3)) expect(REFERRAL_CODE_ALPHABET).toContain(ch);
  });
  it('is deterministic for fixed bytes', () => {
    expect(generatePartnerCode(fixedBytes)).toBe(generatePartnerCode(fixedBytes));
  });
});

describe('normalizeReferralCode', () => {
  it('trims and upper-cases', () => {
    expect(normalizeReferralCode('  hcpabc234 ')).toBe('HCPABC234');
  });
});

describe('isValidPartnerCodeFormat', () => {
  it('accepts a well-formed code in any case', () => {
    expect(isValidPartnerCodeFormat('HCPABC234')).toBe(true);
    expect(isValidPartnerCodeFormat('  hcpABC234 ')).toBe(true);
  });
  it('rejects a learner Refer & Earn code and other junk', () => {
    expect(isValidPartnerCodeFormat('THILAK20')).toBe(false);
    expect(isValidPartnerCodeFormat('HCPABC23')).toBe(false); // 5 chars
    expect(isValidPartnerCodeFormat('HCPABC2345')).toBe(false); // 7 chars
    expect(isValidPartnerCodeFormat('HCPABC01O')).toBe(false); // 0/O/1 not in alphabet
    expect(isValidPartnerCodeFormat('')).toBe(false);
  });
});
