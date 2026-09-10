import type { ReactNode } from 'react';
import { StatCard } from '@/components/ui';

export interface SummaryMetric {
  label: ReactNode;
  value: ReactNode;
}

// The 4-up metric strip at the top of a per-certification detail page.
// Practice: Total Questions / Practice Sets / Questions Practiced /
// Questions Remaining. Mock: Mock Exams / Questions per Exam / Exam
// Duration / Completed.
export function ExamSummaryMetrics({ metrics }: { metrics: SummaryMetric[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {metrics.map((m, i) => (
        <StatCard key={i} label={m.label} value={m.value} />
      ))}
    </div>
  );
}
