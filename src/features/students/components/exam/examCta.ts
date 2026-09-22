// Shared status + call-to-action vocabulary for the redesigned Practice
// Exams / Mock Exams browse cards and the per-certification detail pages.
// Presentation only - the actual take/purchase flows are unchanged.

export type ExamStatus = 'not_started' | 'in_progress' | 'completed' | 'locked';

export type ExamKind = 'practice' | 'mock';

export interface CtaSpec {
  label: string;
  action: 'link';
  href: string;
  variant: 'primary' | 'secondary';
}

const START_LABEL: Record<ExamKind, string> = {
  practice: 'Start Practice',
  mock: 'Start Mock Exam',
};

const REVIEW_LABEL: Record<ExamKind, string> = {
  practice: 'Review',
  mock: 'View Results',
};

// The one CTA shown for a certification card or a set/mock row, for every
// non-locked status. A locked item never gets a CTA here at all - not "Add
// to Cart" (it can't be bought individually, it's entitlement-gated) and not
// "View Plans" either (that button used to open the certification plans
// modal, but the purchase panel is already right there on the same page, so
// a per-row button just duplicated it with no real action of its own).
// Callers show the question count as plain text for a locked item instead -
// see PracticeSetRow / MockExamRow / ExamProductCard.
export function examCta(status: Exclude<ExamStatus, 'locked'>, kind: ExamKind, href: string): CtaSpec {
  if (status === 'completed') return { label: REVIEW_LABEL[kind], action: 'link', href, variant: 'secondary' };
  if (status === 'in_progress') return { label: 'Continue', action: 'link', href, variant: 'primary' };
  return { label: START_LABEL[kind], action: 'link', href, variant: 'primary' };
}

// Roll a set of per-item statuses up to a single certification-level status
// for the browse card. Locked wins (nothing owned); otherwise completed
// only when every owned item is done, in-progress on any activity.
export function rollUpStatus(items: { status: ExamStatus }[]): ExamStatus {
  if (items.length === 0) return 'locked';
  const unlocked = items.filter((i) => i.status !== 'locked');
  if (unlocked.length === 0) return 'locked';
  if (unlocked.every((i) => i.status === 'completed')) return 'completed';
  if (unlocked.some((i) => i.status === 'in_progress' || i.status === 'completed')) return 'in_progress';
  return 'not_started';
}
