import { describe, it, expect } from 'vitest';
import { ageInYears, isAdult, classifySelfReferral } from './partnerEligibility';

const NOW = new Date('2026-09-03T00:00:00Z');

describe('ageInYears / isAdult', () => {
  it('counts whole years, birthday-aware', () => {
    expect(ageInYears('2008-09-03', NOW)).toBe(18);
    expect(ageInYears('2008-09-04', NOW)).toBe(17); // birthday tomorrow
    expect(ageInYears('2000-01-01', NOW)).toBe(26);
  });
  it('isAdult gates on 18', () => {
    expect(isAdult('2008-09-03', NOW)).toBe(true);
    expect(isAdult('2008-09-04', NOW)).toBe(false);
    expect(isAdult('not-a-date', NOW)).toBe(false);
  });
});

describe('classifySelfReferral', () => {
  const base = { partnerUserId: 'p', customerUserId: 'c' };
  it('blocks same account / email / phone', () => {
    expect(classifySelfReferral({ ...base, customerUserId: 'p' })).toBe('block');
    expect(classifySelfReferral({ ...base, partnerEmail: 'A@x.com', customerEmail: 'a@x.com' })).toBe('block');
    expect(classifySelfReferral({ ...base, partnerPhone: '+91 90000 11111', customerPhone: '9000011111' })).toBe('block');
  });
  it('only reviews on a shared IP', () => {
    expect(classifySelfReferral({ ...base, partnerSignupIp: '1.2.3.4', customerSignupIp: '1.2.3.4' })).toBe('review');
  });
  it('ok when nothing matches', () => {
    expect(classifySelfReferral({ ...base, partnerEmail: 'a@x.com', customerEmail: 'b@y.com', partnerSignupIp: '1.1.1.1', customerSignupIp: '2.2.2.2' })).toBe('ok');
  });
  it('a hard match wins over a shared IP', () => {
    expect(
      classifySelfReferral({
        ...base,
        customerUserId: 'p',
        partnerSignupIp: '9.9.9.9',
        customerSignupIp: '9.9.9.9',
      }),
    ).toBe('block');
  });
  it('a short / partial phone number never false-blocks', () => {
    expect(classifySelfReferral({ ...base, partnerPhone: '12345', customerPhone: '12345' })).toBe('ok');
  });
  it('different phones do not block', () => {
    expect(classifySelfReferral({ ...base, partnerPhone: '9000011111', customerPhone: '9000022222' })).toBe('ok');
  });
  it('empty / missing signals are ignored, not treated as equal', () => {
    expect(classifySelfReferral({ ...base, partnerEmail: '', customerEmail: '' })).toBe('ok');
    expect(classifySelfReferral({ ...base, partnerSignupIp: null, customerSignupIp: null })).toBe('ok');
  });
});

describe('ageInYears - calendar edge cases', () => {
  it('handles a leap-day birthday', () => {
    expect(ageInYears('2004-02-29', new Date('2026-02-28T00:00:00Z'))).toBe(21);
    expect(ageInYears('2004-02-29', new Date('2026-03-01T00:00:00Z'))).toBe(22);
  });
  it('is exactly 18 on the 18th birthday', () => {
    expect(isAdult('2008-06-15', new Date('2026-06-15T12:00:00Z'))).toBe(true);
    expect(isAdult('2008-06-15', new Date('2026-06-14T12:00:00Z'))).toBe(false);
  });
});
