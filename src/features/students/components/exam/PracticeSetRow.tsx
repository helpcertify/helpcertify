import { pad2 } from './format';
import { examCta, type ExamStatus } from './examCta';
import { ExamRowCta } from './ExamRowCta';
import { ExamProgressBar } from './ExamProgressBar';

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
  const pct = set.totalQuestions > 0 ? (set.answered / set.totalQuestions) * 100 : 0;

  const sub = (() => {
    if (set.status === 'locked') return `${set.totalQuestions} Questions · requires Practice Questions access`;
    if (set.status === 'completed') {
      return set.accuracyPct != null ? `Completed · Accuracy ${set.accuracyPct}%` : 'Completed';
    }
    if (set.status === 'in_progress') return `${set.answered} / ${set.totalQuestions} completed`;
    return `${set.totalQuestions} Questions`;
  })();

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="w-6 shrink-0 text-center text-xs font-bold text-ink-faint [font-variant-numeric:tabular-nums]">
          {pad2(set.index)}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-ink">Practice Set {pad2(set.index)}</span>
            {set.status === 'completed' && (
              <span className="rounded bg-success-soft px-1.5 py-0.5 text-[10px] font-bold uppercase text-success">Done</span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-ink-faint">{sub}</div>
          {set.status === 'in_progress' && <ExamProgressBar pct={pct} className="mt-1.5 max-w-[220px]" />}
        </div>
      </div>
      <ExamRowCta cta={examCta(set.status, 'practice', takeHref)} onViewPlans={onViewPlans} />
    </div>
  );
}
