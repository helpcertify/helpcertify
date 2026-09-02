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
  const navigate = useNavigate();
  const noun = kind === 'practice' ? 'Practice Exams' : 'Mock Exams';
  const takeBase = kind === 'practice' ? '/practice-tests' : '/quizzes';
  const sorted = [...items].sort((a, b) => a.batchIndex - b.batchIndex);

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.05)] dark:border-surface-border dark:bg-surface-raised">
      <button
        type="button"
        onClick={() => owned && setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <div>
          <h2 className="text-[15px] font-bold text-ink">
            {certName} {noun}
          </h2>
          <p className="mt-0.5 text-xs text-ink-faint">
            {sorted.length} {kind === 'practice' ? 'exam' : 'exam'}
            {sorted.length === 1 ? '' : 's'}
            {totalQuestions > 0 && ` · ${totalQuestions.toLocaleString()} questions`}
          </p>
        </div>
        {owned && (
          <span className={`shrink-0 text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
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
              <ul className="divide-y divide-[#E2E8F0] border-t border-[#E2E8F0] dark:divide-surface-border dark:border-surface-border">
                {sorted.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`${takeBase}/${item.id}/take`)}
                      className="flex w-full items-center justify-between gap-4 px-5 py-3 text-left text-sm hover:bg-[#F8FAFF] dark:hover:bg-white/5"
                    >
                      <span className="font-medium text-[#155EEF]">{item.label}</span>
                      {item.hint && <span className="shrink-0 text-xs text-ink-faint">{item.hint}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )
      )}
    </div>
  );
}
