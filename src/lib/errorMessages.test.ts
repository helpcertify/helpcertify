import { describe, it, expect } from 'vitest';
import { FirebaseError } from 'firebase/app';
import { VercelApiError } from './apiError';
import { errorText, friendlyApiError, expandValidationIssues } from './errorMessages';

describe('expandValidationIssues', () => {
  it('names the field and keeps the zod message', () => {
    expect(
      expandValidationIssues([{ path: ['shortDescription'], message: 'String must contain at most 300 character(s)' }]),
    ).toBe('Short description: String must contain at most 300 character(s)');
  });
  it('de-camelCases an unknown field key', () => {
    expect(expandValidationIssues([{ path: ['mockDurationMinutes'], message: 'Required' }])).toBe(
      'Mock exam duration: Required',
    );
    expect(expandValidationIssues([{ path: ['somethingElse'], message: 'Required' }])).toBe(
      'Something else: Required',
    );
  });
  it('caps at three issues and joins them', () => {
    const many = ['a', 'b', 'c', 'd'].map((k) => ({ path: [k], message: 'bad' }));
    expect(expandValidationIssues(many)?.split(';')).toHaveLength(3);
  });
  it('returns null for a non-list', () => {
    expect(expandValidationIssues(undefined)).toBeNull();
    expect(expandValidationIssues([])).toBeNull();
    expect(expandValidationIssues('nope')).toBeNull();
  });
});

describe('friendlyApiError', () => {
  it('expands validation details', () => {
    const err = new VercelApiError('Validation failed', 422, [{ path: ['passMarkPercent'], message: 'too big' }]);
    expect(friendlyApiError(err, 'fallback')).toBe('Please fix - Pass mark: too big');
  });
  it('maps status codes with no details', () => {
    expect(friendlyApiError(new VercelApiError('x', 401), 'f')).toMatch(/session has expired/i);
    expect(friendlyApiError(new VercelApiError('x', 403), 'f')).toMatch(/permission/i);
    expect(friendlyApiError(new VercelApiError('x', 404), 'f')).toMatch(/no longer exists/i);
    expect(friendlyApiError(new VercelApiError('x', 500), 'f')).toMatch(/our side/i);
  });
  it('keeps a specific 409/402 message', () => {
    expect(friendlyApiError(new VercelApiError('Coupon already used', 409), 'f')).toBe('Coupon already used');
  });
  it('falls back for a plain error', () => {
    expect(friendlyApiError(new Error('boom'), 'f')).toBe('boom');
    expect(friendlyApiError({}, 'f')).toBe('f');
  });
});

describe('errorText', () => {
  it('routes Firebase auth errors', () => {
    expect(errorText(new FirebaseError('auth/invalid-credential', 'x'), 'f')).toMatch(/incorrect email or password/i);
  });
  it('routes API errors', () => {
    expect(errorText(new VercelApiError('x', 404), 'f')).toMatch(/no longer exists/i);
  });
  it('handles unknowns', () => {
    expect(errorText('a string', 'f')).toBe('f');
    expect(errorText(new Error('msg'), 'f')).toBe('msg');
  });
});
