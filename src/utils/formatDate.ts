/**
 * Normalizes whatever shape a "timestamp" arrives in on the frontend into a
 * real Date:
 *  - a Firestore Timestamp instance (from a direct client SDK read) — has .toDate()
 *  - the plain-object shape a Callable Function's JSON response serializes
 *    a Timestamp into — { _seconds, _nanoseconds } — NOT an ISO string
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
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
