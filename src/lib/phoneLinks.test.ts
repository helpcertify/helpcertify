import { describe, it, expect } from 'vitest';
import { toWhatsAppDigits, whatsAppLink } from './phoneLinks';

describe('toWhatsAppDigits', () => {
  it('defaults a bare 10-digit number to India', () => {
    expect(toWhatsAppDigits('9591222822')).toBe('919591222822');
    expect(toWhatsAppDigits('9591222822', 'IN')).toBe('919591222822');
  });
  it('strips formatting (spaces, dashes, +)', () => {
    expect(toWhatsAppDigits('+91 95912 22822')).toBe('919591222822');
    expect(toWhatsAppDigits('091-9591222822')).toBe('919591222822');
  });
  it('leaves an already-country-coded number alone', () => {
    expect(toWhatsAppDigits('919591222822')).toBe('919591222822');
    expect(toWhatsAppDigits('+1 415 555 0100')).toBe('14155550100');
  });
  it('does not assume India for a non-IN country', () => {
    expect(toWhatsAppDigits('4155550100', 'US')).toBe('4155550100');
  });
  it('returns null for empty input', () => {
    expect(toWhatsAppDigits('')).toBeNull();
    expect(toWhatsAppDigits('   ')).toBeNull();
  });
});

describe('whatsAppLink', () => {
  it('builds a wa.me link', () => {
    expect(whatsAppLink('9591222822')).toBe('https://wa.me/919591222822');
  });
  it('returns null for unusable input', () => {
    expect(whatsAppLink('')).toBeNull();
  });
});
