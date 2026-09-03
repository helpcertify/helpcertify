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
});
