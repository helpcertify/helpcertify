import { describe, it, expect } from 'vitest';
import { VALIDITY_PRESETS, presetForDays, validityLabel } from './validityPresets';

describe('validity presets', () => {
  it('covers 10d / 1mo / 3mo / 6mo / 1yr', () => {
    expect(VALIDITY_PRESETS.map((p) => p.days)).toEqual([10, 30, 90, 180, 365]);
  });

  it('presetForDays matches a preset and returns null for a custom value', () => {
    expect(presetForDays(90)?.label).toBe('3 months');
    expect(presetForDays(45)).toBeNull();
  });

  it('validityLabel names presets, falls back to "<n> days", and 0 is lifetime', () => {
    expect(validityLabel(365)).toBe('1 year');
    expect(validityLabel(45)).toBe('45 days');
    expect(validityLabel(0)).toBe('Lifetime access');
  });
});
