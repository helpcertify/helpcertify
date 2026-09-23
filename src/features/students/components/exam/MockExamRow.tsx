import { pad2, formatDuration } from './format';
import { examCta, type ExamStatus } from './examCta';
import { ExamRowCta } from './ExamRowCta';

export interface MockExamRowModel {
  quizId: string;
  index: number;
  totalQuestions: number;
  durationMinutes: number;
  status: ExamStatus;
  scorePct: number | null;
}

// One row in the per-certification detail page's "Mock Exams" tab.
// takeHref -> the existing /quizzes/:id/take route (Start / Continue);
// resultHref -> /home/past-quizzes/:id (View Results); locked -> plans modal.
export function MockExamRow({
  mock,
  takeHref,
  resultHref,
  onViewPlans,
}: {
  mock: MockExamRowModel;
  takeHref: string;
  resultHref: string;
  onViewPlans: () => void;
}) {
  const facts = `${mock.totalQuestions} Questions · ${formatDuration(mock.durationMinutes)}`;
  const sub = (() => {
    if (mock.status === 'locked') return 'Locked';
    if (mock.status === 'in_progress') return 'In progress · resume where you left off';
    return facts;
  })();
  const href = mock.status === 'completed' ? resultHref : takeHref;

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-ink">Mock Exam {pad2(mock.index)}</span>
          {mock.status === 'completed' && mock.scorePct != null && (
            <span className="rounded-md bg-success-soft px-1.5 py-0.5 text-[11px] font-semibold text-success">
              Score {mock.scorePct}%
            </span>
          )}
        </div>
        <div className="mt-0.5 text-xs text-ink-faint">{sub}</div>
      </div>
      <ExamRowCta cta={examCta(mock.status, 'mock', href)} onViewPlans={onViewPlans} />
    </div>
  );
}
