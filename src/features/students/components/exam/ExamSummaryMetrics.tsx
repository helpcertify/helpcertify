import type { ReactNode } from 'react';

export interface SummaryMetric {
  label: ReactNode;
  value: ReactNode;
  icon?: ReactNode;
}

// One compact summary panel at the top of a per-certification detail page
// (replaces four separate large stat cards). Practice: Total Questions /
// Practice Sets / Practiced / Remaining. Mock: Mock Exams / Questions per
// Exam / Exam Duration / Completed. 2-up on mobile, 4-up from sm.
export function ExamSummaryMetrics({ metrics }: { metrics: SummaryMetric[] }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-surface-border bg-surface-border shadow-card sm:grid-cols-4">
      {metrics.map((m, i) => (
        <div key={i} className="flex items-center gap-2.5 bg-surface-raised p-3.5">
          {m.icon && <span className="shrink-0 text-brand-500">{m.icon}</span>}
          <div className="min-w-0">
            <div className="text-lg font-extrabold leading-tight tracking-tight text-ink [font-variant-numeric:tabular-nums]">
              {m.value}
            </div>
            <div className="truncate text-[11px] font-medium text-ink-faint">{m.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
