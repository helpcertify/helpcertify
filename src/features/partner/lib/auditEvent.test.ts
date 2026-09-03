import { describe, it, expect } from 'vitest';
import { redactForAudit, maskEmail } from './auditEvent';

describe('maskEmail', () => {
  it('keeps the first char and the domain', () => {
    expect(maskEmail('john.doe@example.com')).toBe('j***@example.com');
    expect(maskEmail('nonsense')).toBe('***');
  });
});

describe('redactForAudit', () => {
  it('drops sensitive keys and masks emails, recursively', () => {
    const before = {
      displayName: 'Thilak',
      email: 'thilak@example.com',
      kyc: { pan: 'ABCDE1234F', bankAccount: '000111222', ifsc: 'HDFC0001' },
      contact: { phone: '9000011111', altEmail: 'x@y.com' },
      note: 'plain text stays',
    };
    const after = redactForAudit(before) as Record<string, unknown>;
    expect(after.displayName).toBe('Thilak');
    expect(after.note).toBe('plain text stays');
    expect(after.email).toBe('t***@example.com');
    expect((after.kyc as Record<string, unknown>).pan).toBe('[redacted]');
    expect((after.kyc as Record<string, unknown>).bankAccount).toBe('[redacted]');
    expect((after.kyc as Record<string, unknown>).ifsc).toBe('[redacted]');
    expect((after.contact as Record<string, unknown>).altEmail).toBe('x***@y.com');
    expect((after.contact as Record<string, unknown>).phone).toBe('9000011111');
  });
  it('masks a bare email string value', () => {
    expect(redactForAudit('a@b.com')).toBe('a***@b.com');
  });
  it('passes null / primitives through', () => {
    expect(redactForAudit(null)).toBeNull();
    expect(redactForAudit(42)).toBe(42);
  });
});
