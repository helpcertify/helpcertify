import type { ParseErrorEntry } from '@/features/admin/api/contentAdminApi';

interface UploadReportProps {
  totalQuestions: number;
  errors: ParseErrorEntry[];
  warnings: string[];
  onDismiss: () => void;
}

// Shown after a quiz/practice-test upload on both create forms (QuizFormCard,
// PracticeTestFormCard) - surfaces what an admin needs to know about
// problems in their .docx: which specific questions the parser had to skip
// and why, plus document-level numbering issues (duplicate/missing question
// numbers in the source file). This used to only go to console.warn, which
// an admin would never think to open - confirmed live: a 928-numbered file
// that only had 834 real question paragraphs looked exactly like the app
// silently dropping ~90 questions until someone dug into the file's own XML
// to find the gaps/duplicates.
export function UploadReport({ totalQuestions, errors, warnings, onDismiss }: UploadReportProps) {
  if (errors.length === 0 && warnings.length === 0) return null;

  return (
    <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink">
          Upload report: {totalQuestions} question{totalQuestions === 1 ? '' : 's'} created
        </h3>
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="text-ink-faint hover:text-ink">
          ✕
        </button>
      </div>

      {warnings.length > 0 && (
        <div className="mb-3 space-y-1">
          <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">Source file notes</div>
          {warnings.map((w, i) => (
            <p key={i} className="text-sm text-ink">
              {w}
            </p>
          ))}
        </div>
      )}

      {errors.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">
            {errors.length} question{errors.length === 1 ? '' : 's'} could not be parsed
          </div>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {errors.map((e, i) => (
              <div key={i} className="rounded-lg border border-surface-border bg-surface-raised p-2.5 text-sm">
                <div className="text-ink-faint">
                  Line {e.line}: {e.message}
                </div>
                {e.rawText && <div className="mt-0.5 truncate text-ink-muted">"{e.rawText}"</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
