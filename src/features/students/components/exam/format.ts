// Small display helpers shared across the exam components.

export const pad2 = (n: number): string => String(n).padStart(2, '0');

// "4 Hours" / "90 min" from a duration in minutes.
export function formatDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return 'Untimed';
  if (minutes % 60 === 0) {
    const h = minutes / 60;
    return `${h} Hour${h === 1 ? '' : 's'}`;
  }
  if (minutes > 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
  }
  return `${minutes} min`;
}
