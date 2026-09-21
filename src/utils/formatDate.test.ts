import { describe, it, expect } from 'vitest';
import { formatDate, toDate, isRecentlyPublished } from './formatDate';

describe('formatDate', () => {
  it('formats an ISO string as a readable date and time', () => {
    const formatted = formatDate('2026-07-23T11:00:00Z');
    expect(formatted).toMatch(/2026/);
  });

  it('accepts a Date instance directly', () => {
    const formatted = formatDate(new Date('2026-01-01T00:00:00Z'));
    expect(formatted).toMatch(/2026/);
  });

  it('formats a Callable Function\'s serialized Timestamp shape', () => {
    const formatted = formatDate({ _seconds: 1798700400, _nanoseconds: 0 });
    expect(formatted).toMatch(/2026/);
  });
});

describe('toDate', () => {
  it('reads a Firestore-Timestamp-like object via .toDate()', () => {
    const fakeTimestamp = { toDate: () => new Date('2026-05-01T00:00:00Z') };
    expect(toDate(fakeTimestamp).getUTCFullYear()).toBe(2026);
  });

  it('returns an invalid Date for unrecognized input rather than throwing', () => {
    expect(Number.isNaN(toDate(undefined).getTime())).toBe(true);
  });
});

describe('isRecentlyPublished', () => {
  const now = new Date('2026-09-21T00:00:00Z');

  it('is true for something created a few days ago', () => {
    expect(isRecentlyPublished('2026-09-18T00:00:00Z', now)).toBe(true);
  });

  it('is false for something created well outside the window', () => {
    expect(isRecentlyPublished('2026-01-01T00:00:00Z', now)).toBe(false);
  });

  it('respects a custom window', () => {
    expect(isRecentlyPublished('2026-09-01T00:00:00Z', now, 30)).toBe(true);
    expect(isRecentlyPublished('2026-09-01T00:00:00Z', now, 10)).toBe(false);
  });

  it('is false for a future or missing date rather than throwing', () => {
    expect(isRecentlyPublished(undefined, now)).toBe(false);
    expect(isRecentlyPublished('2026-10-01T00:00:00Z', now)).toBe(false);
  });
});
