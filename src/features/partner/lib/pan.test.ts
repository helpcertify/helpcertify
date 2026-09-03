import { describe, it, expect } from 'vitest';
import {
  normalizePan,
  isValidPanFormat,
  maskPan,
  panLast4,
  isValidGstinFormat,
  panFromGstin,
  isPayoutEligible,
} from './pan';

describe('normalizePan', () => {
  it('upper-cases and strips whitespace', () => {
    expect(normalizePan(' abcde1234f ')).toBe('ABCDE1234F');
    expect(normalizePan('abc de12 34f')).toBe('ABCDE1234F');
  });
});

describe('isValidPanFormat', () => {
  it('accepts a well-formed PAN in any case', () => {
    expect(isValidPanFormat('ABCDE1234F')).toBe(true);
    expect(isValidPanFormat(' abcde1234f ')).toBe(true);
  });
  it('rejects malformed input', () => {
    expect(isValidPanFormat('ABCD1234F')).toBe(false); // 4 letters
    expect(isValidPanFormat('ABCDE123F')).toBe(false); // 3 digits
    expect(isValidPanFormat('ABCDE12345')).toBe(false); // ends in digit
    expect(isValidPanFormat('ABCDE1234FG')).toBe(false); // too long
    expect(isValidPanFormat('')).toBe(false);
    expect(isValidPanFormat('12345ABCDF')).toBe(false);
  });
});

describe('maskPan', () => {
  it('shows first 5 and last 1', () => {
    expect(maskPan('ABCDE1234F')).toBe('ABCDE****F');
    expect(maskPan('abcde1234f')).toBe('ABCDE****F');
  });
  it('returns a safe placeholder for junk', () => {
    expect(maskPan('nope')).toBe('****');
  });
});

describe('panLast4', () => {
  it('returns the trailing 4 characters', () => {
    expect(panLast4('ABCDE1234F')).toBe('234F');
  });
});

describe('GSTIN', () => {
  const gstin = '22ABCDE1234F1Z5';
  it('validates a well-formed GSTIN', () => {
    expect(isValidGstinFormat(gstin)).toBe(true);
    expect(isValidGstinFormat('bad')).toBe(false);
    expect(isValidGstinFormat('22ABCDE1234F1X5')).toBe(false); // no Z in slot 14
  });
  it('extracts the embedded PAN', () => {
    expect(panFromGstin(gstin)).toBe('ABCDE1234F');
    expect(panFromGstin('malformed')).toBeNull();
  });
});

describe('isPayoutEligible', () => {
  it('is true only for OK', () => {
    expect(isPayoutEligible('OK')).toBe(true);
    expect(isPayoutEligible('KYC_ACTION_REQUIRED')).toBe(false);
    expect(isPayoutEligible('PAYOUT_BLOCKED')).toBe(false);
    expect(isPayoutEligible(undefined)).toBe(false);
    expect(isPayoutEligible(null)).toBe(false);
  });
});
