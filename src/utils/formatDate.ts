/**
 * Normalizes whatever shape a "timestamp" arrives in on the frontend into a
 * real Date:
 *  - a Firestore Timestamp instance (from a direct client SDK read) - has .toDate()
 *  - the plain-object shape a Callable Function's JSON response serializes
 *    a Timestamp into - { _seconds, _nanoseconds } - NOT an ISO string
 *  - an already-ISO string or epoch number
 * Any new UI code reading a time field from a callable response should go
 * through this rather than rendering the value directly.
 */
export function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value);
  if (value && typeof value === 'object') {
    const v = value as { toDate?: () => Date; _seconds?: number; seconds?: number };
    if (typeof v.toDate === 'function') return v.toDate();
    const seconds = v._seconds ?? v.seconds;
    if (typeof seconds === 'number') return new Date(seconds * 1000);
  }
  return new Date(NaN);
}

export function formatDate(value: unknown): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

// "16-Aug-2026" - an unambiguous day-month-year format (no locale-dependent
// slash ordering like toLocaleDateString()'s "9/8/2026", which reads as
// either 9 Aug or Sep 8 depending on the viewer's locale) for exam-date-ish
// displays (Study Plan's exam countdown, suggested exam date).
export function formatShortDate(value: unknown): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  const day = date.getDate();
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  return `${day}-${month}-${date.getFullYear()}`;
}

// Drives ProductCardShell's "New" badge - true only for a real createdAt
// within the last `days`, never a fabricated freshness signal. `now`
// defaults to the real clock; a caller can pass a fixed instant for a
// deterministic test.
const NEW_BADGE_WINDOW_DAYS = 14;

export function isRecentlyPublished(createdAt: unknown, now: Date = new Date(), days = NEW_BADGE_WINDOW_DAYS): boolean {
  const date = toDate(createdAt);
  if (Number.isNaN(date.getTime())) return false;
  const ageMs = now.getTime() - date.getTime();
  return ageMs >= 0 && ageMs <= days * 24 * 60 * 60 * 1000;
}
