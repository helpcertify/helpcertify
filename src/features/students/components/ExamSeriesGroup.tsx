import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export interface SeriesGroupItem {
  id: string;
  batchIndex: number;
  label: string;
  // e.g. "30 / 150 practiced" (practice) or "Already attempted" (mock)
  hint?: string;
}

// One card per certification on the Practice Exams / Mock Exams pages. Click
// the header to expand the ordered list of batch links; each link goes
// straight to the take page (no setup screen). Not owned -> the body is
// replaced by a single "Unlock with a package" link.
export function ExamSeriesGroup({
  certName,
  kind,
  items,
  totalQuestions,
  owned,
  entitlementLocked,
  onSetGoal,
  goalPanel,
}: {
  certName: string;
  kind: 'practice' | 'mock';
  items: SeriesGroupItem[];
  totalQuestions: number;
  owned: boolean;
  entitlementLocked: boolean;
  onSetGoal?: () => void;
  goalPanel?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [feedbackMode, setFeedbackMode] = useState<'immediate' | 'end_of_session'>('immediate');
  const navigate = useNavigate();
  const noun = kind === 'practice' ? 'Practice Exams' : 'Mock Exams';
  const takeBase = kind === 'practice' ? '/practice-tests' : '/quizzes';
  const sorted = [...items].sort((a, b) => a.batchIndex - b.batchIndex);
  const startHref = (id: string) =>
    kind === 'practice' ? `${takeBase}/${id}/take?feedbackMode=${feedbackMode}` : `${takeBase}/${id}/take`;

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-[#BFDBFE] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.05)] dark:border-surface-border dark:bg-surface-raised">
      <button
        type="button"
        onClick={() => owned && setOpen((v) => !v)}
        aria-expanded={owned ? open : undefined}
        className={`flex w-full items-center justify-between gap-4 border-l-4 border-[#155EEF] bg-[#F5F9FF] px-5 py-4 text-left dark:bg-[#155EEF]/10 ${
          owned ? 'cursor-pointer hover:bg-[#EBF3FF] dark:hover:bg-[#155EEF]/20' : 'cursor-default'
        }`}
      >
        <div>
          <h2 className="text-base font-bold text-[#155EEF]">
            {certName} {noun}
          </h2>
          <p className="mt-0.5 text-xs text-ink-faint">
            {sorted.length} exam{sorted.length === 1 ? '' : 's'}
            {totalQuestions > 0 && ` · ${totalQuestions.toLocaleString()} questions`}
          </p>
        </div>
        {owned && (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#155EEF] px-3 py-1 text-xs font-semibold text-white">
            {open ? 'Hide exams' : 'View exams'}
            <span className={`transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
          </span>
        )}
      </button>

      {entitlementLocked ? (
        <div className="border-t border-[#E2E8F0] px-5 py-4 dark:border-surface-border">
          <Link
            to="/home"
            className="block w-full rounded-lg border border-[#155EEF] py-2 text-center text-sm font-semibold text-[#155EEF] hover:bg-[#F8FAFF]"
          >
            Unlock with a package
          </Link>
        </div>
      ) : (
        owned && (
          <>
            {onSetGoal && (
              <div className="border-t border-[#E2E8F0] px-5 py-3 dark:border-surface-border">
                <button
                  type="button"
                  onClick={onSetGoal}
                  className="rounded-lg border border-[#155EEF] bg-white px-4 py-2 text-sm font-semibold text-[#155EEF] hover:bg-[#EFF6FF] dark:bg-transparent"
                >
                  🎯 Set My Study Goal
                </button>
              </div>
            )}
            {goalPanel && (
              <div className="border-t border-[#E2E8F0] px-5 py-4 dark:border-surface-border">{goalPanel}</div>
            )}
            {open && (
              <>
                {kind === 'practice' && (
                  <div className="border-t border-[#E2E8F0] px-5 py-3 dark:border-surface-border">
                    <div className="mb-2 text-xs font-medium text-ink-faint">How would you like to practice?</div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => setFeedbackMode('immediate')}
                        className={`rounded-lg border p-2.5 text-left text-xs ${feedbackMode === 'immediate' ? 'border-[#155EEF] bg-[#EFF6FF]' : 'border-[#E2E8F0] hover:border-[#155EEF]'}`}
                      >
                        <div className="text-sm font-semibold text-ink">⚡ Learn As You Go</div>
                        <div className="mt-0.5 text-ink-faint">See the answer after every question.</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setFeedbackMode('end_of_session')}
                        className={`rounded-lg border p-2.5 text-left text-xs ${feedbackMode === 'end_of_session' ? 'border-[#155EEF] bg-[#EFF6FF]' : 'border-[#E2E8F0] hover:border-[#155EEF]'}`}
                      >
                        <div className="text-sm font-semibold text-ink">📝 Review At End</div>
                        <div className="mt-0.5 text-ink-faint">See answers after finishing the session.</div>
                      </button>
                    </div>
                  </div>
                )}
                <ul className="divide-y divide-[#E2E8F0] border-t border-[#E2E8F0] dark:divide-surface-border dark:border-surface-border">
                  {sorted.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => navigate(startHref(item.id))}
                        className="flex w-full items-center justify-between gap-4 px-5 py-3 text-left text-sm hover:bg-[#F8FAFF] dark:hover:bg-white/5"
                      >
                        <span className="font-medium text-[#155EEF]">{item.label}</span>
                        {item.hint && <span className="shrink-0 text-xs text-ink-faint">{item.hint}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )
      )}
    </div>
  );
}
