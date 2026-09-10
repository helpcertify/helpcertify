import type { SeriesStudyGoalView } from '../../hooks/useSeriesStudyGoal';

// The sticky-column companion to CertificationPurchasePanel's "Your plan"
// card - same gradient-header shell, stacked directly below it, so a
// purchased package and a study goal read as two distinct but visually
// matched things rather than one page trying to reuse a single card for
// both. Set/Edit both open the full StudyGoalPanel form, which stays in
// the main column (a multi-step wizard doesn't fit this narrow a card).
export function StudyGoalCard({
  hasLoaded,
  hasPlan,
  goal,
  answered,
  total,
  accuracyPct,
  onOpen,
}: {
  hasLoaded: boolean;
  hasPlan: boolean;
  goal: SeriesStudyGoalView | null;
  answered: number;
  total: number;
  accuracyPct: number | null;
  onOpen: () => void;
}) {
  if (!hasLoaded) return null;

  if (!hasPlan || !goal) {
    return (
      <div className="rounded-xl border border-dashed border-brand-500/40 bg-surface-raised p-5 text-center">
        <div className="text-2xl" aria-hidden>
          🎯
        </div>
        <div className="mt-1 text-sm font-semibold text-ink">No study goal set yet</div>
        <p className="mt-1 text-xs text-ink-faint">
          Tell us your exam date (or your daily pace) and we&rsquo;ll calculate your daily target.
        </p>
        <button
          type="button"
          onClick={onOpen}
          className="mt-3 rounded-lg border border-brand-500 bg-surface-raised px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-brand-500/10 dark:bg-transparent"
        >
          Set My Study Goal
        </button>
      </div>
    );
  }

  const pct = total > 0 ? Math.round((answered / total) * 100) : 0;

  return (
    <div className="overflow-hidden rounded-xl border border-brand-500/40 bg-surface-raised shadow-pop">
      <div className="bg-brand-500 px-5 py-4 text-white">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/75">🎯 Your Study Goal</div>
            <div className="mt-1 text-base font-extrabold leading-tight">
              {goal.dateLabel}: {goal.dateValue}
            </div>
          </div>
          <button
            type="button"
            onClick={onOpen}
            className="shrink-0 rounded-lg bg-white/20 px-2.5 py-1 text-xs font-bold hover:bg-white/30"
          >
            Edit
          </button>
        </div>
      </div>

      <div className="p-5">
        <div className="grid grid-cols-2 gap-4">
          <Stat label={goal.dateLabel === 'Exam Date' ? 'Days to Exam' : 'Suggested Exam'} value={goal.daysNote} icon="📅" />
          <Stat label="Daily Target" value={`${goal.dailyTarget} Qs`} sub="per day" icon="📚" />
          <Stat label="Streak" value={`${goal.streak} Day${goal.streak === 1 ? '' : 's'}`} sub={goal.streak > 0 ? 'keep it up' : undefined} icon="🔥" />
          <Stat label="Accuracy" value={accuracyPct != null ? `${accuracyPct}%` : '-'} icon="📈" />
        </div>

        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
          <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
        <div className="mt-1 flex items-center justify-between text-xs text-ink-faint">
          <span className="[font-variant-numeric:tabular-nums]">
            {answered.toLocaleString()} / {total.toLocaleString()} practiced
          </span>
          <span>{pct}%</span>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wide text-ink-faint">
        {icon} {label}
      </div>
      <div className="mt-0.5 text-sm font-extrabold text-ink">{value}</div>
      {sub && <div className="text-[11px] text-ink-faint">{sub}</div>}
    </div>
  );
}
