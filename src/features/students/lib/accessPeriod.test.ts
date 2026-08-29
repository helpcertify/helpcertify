import { describe, expect, it } from 'vitest';
import { accessPeriodLabel } from './accessPeriod';

describe('accessPeriodLabel', () => {
  it('treats 0 / null / undefined as permanent', () => {
    expect(accessPeriodLabel(0)).toBe('Lifetime access');
    expect(accessPeriodLabel(null)).toBe('Lifetime access');
    expect(accessPeriodLabel(undefined)).toBe('Lifetime access');
    expect(accessPeriodLabel(-5)).toBe('Lifetime access');
  });

  it('renders a day count', () => {
    expect(accessPeriodLabel(180)).toBe('180 days');
    expect(accessPeriodLabel(1)).toBe('1 days');
  });

  it('renders whole years', () => {
    expect(accessPeriodLabel(365)).toBe('1 year');
    expect(accessPeriodLabel(730)).toBe('2 years');
  });
});
