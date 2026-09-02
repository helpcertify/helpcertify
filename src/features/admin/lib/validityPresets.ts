// The access-validity choices an admin picks per package, mapped to the
// `accessValidityDays` number that PackageDoc / the checkout already store.
// Pure + unit-tested (validityPresets.test.ts).

export interface ValidityPreset {
  label: string;
  days: number;
}

export const VALIDITY_PRESETS: ValidityPreset[] = [
  { label: '10 days', days: 10 },
  { label: '1 month', days: 30 },
  { label: '3 months', days: 90 },
  { label: '6 months', days: 180 },
  { label: '1 year', days: 365 },
];

/** The preset whose day count matches `days`, or null when the admin has
 *  set a custom number (the form then shows the "Custom" number input). */
export function presetForDays(days: number): ValidityPreset | null {
  return VALIDITY_PRESETS.find((p) => p.days === days) ?? null;
}

/** A short human label for any day count - a preset name when it matches
 *  one, otherwise "<n> days". Used in checkout / My Purchases. */
export function validityLabel(days: number): string {
  if (!days || days <= 0) return 'Lifetime access';
  return presetForDays(days)?.label ?? `${days} days`;
}
