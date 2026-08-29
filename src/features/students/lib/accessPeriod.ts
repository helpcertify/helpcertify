// A product's access period, for display on checkout surfaces and in the
// purchase-consent record. Individual quizzes / practice tests default to
// 0 (permanent) — the entitlement gates in api/quiz-session.ts /
// api/practice-session.ts do not expire access today; this label is what
// the learner is shown and what gets snapshotted at purchase. Packages
// carry their own accessValidityDays (always >= 1).
export function accessPeriodLabel(days: number | null | undefined): string {
  if (!days || days <= 0) return 'Lifetime access';
  if (days % 365 === 0) {
    const years = days / 365;
    return `${years} year${years === 1 ? '' : 's'}`;
  }
  return `${days} days`;
}
