import { pad2 } from './format';
import { examCta, type ExamStatus } from './examCta';
import { ExamRowCta } from './ExamRowCta';

export interface PracticeSetRowModel {
  testId: string;
  index: number;
  totalQuestions: number;
  answered: number;
  accuracyPct: number | null;
  status: ExamStatus;
}

// One row in the per-certification detail page's "Practice Sets" tab.
// takeHref is where Start / Continue / Review go (an existing
// /practice-tests/:id/take route); the locked CTA opens the plans modal.
export function PracticeSetRow({
  set,
  takeHref,
  onViewPlans,
}: {
  set: PracticeSetRowModel;
  takeHref: string;
  onViewPlans: () => void;
}) {
  const sub = (() => {
    if (set.status === 'locked') return 'Locked';
    if (set.status === 'completed') {
      return set.accuracyPct != null ? `Completed · Accuracy ${set.accuracyPct}%` : 'Completed';
    }
    if (set.status === 'in_progress') return `${set.answered} / ${set.totalQuestions} completed`;
    return `${set.totalQuestions} Questions`;
  })();

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-ink">Practice Set {pad2(set.index)}</div>
        <div className="mt-0.5 text-xs text-ink-faint">{sub}</div>
      </div>
      <ExamRowCta cta={examCta(set.status, 'practice', takeHref)} onViewPlans={onViewPlans} />
    </div>
  );
}
