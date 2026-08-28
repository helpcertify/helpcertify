// Money moves through this app in the smallest unit of whatever currency an
// item is priced in — paise for INR, cents for USD — matching what
// Razorpay's API expects. Both currencies use a 100:1 minor:major ratio, so
// the conversion math is identical; only display formatting is
// currency-aware.

export type SupportedCurrency = 'INR' | 'USD';

const LOCALE_FOR: Record<SupportedCurrency, string> = { INR: 'en-IN', USD: 'en-US' };

export function formatMoney(minorUnits: number, currency: SupportedCurrency = 'INR'): string {
  const major = minorUnits / 100;
  const isWhole = Number.isInteger(major);
  return new Intl.NumberFormat(LOCALE_FOR[currency], {
    style: 'currency',
    currency,
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(major);
}

export function majorToMinor(major: number): number {
  return Math.round(major * 100);
}

export function minorToMajor(minor: number): number {
  return minor / 100;
}

// Refer & Earn's rewards (and admin-created coupons generally) can be a
// flat amount or a percentage, admin-configurable — one place to format
// either, rather than duplicating the flat-vs-percent branch everywhere a
// reward is shown (RegisterPage's welcome toast, ReferAndEarnSection's
// banner and referral list).
export function formatReward(type: 'flat' | 'percent', value: number, currency: SupportedCurrency = 'INR'): string {
  return type === 'percent' ? `${value}%` : formatMoney(value, currency);
}
