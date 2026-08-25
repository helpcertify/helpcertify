interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

// Generic yes/no modal — used wherever an action needs a friendly "are you
// sure" step before something irreversible happens (e.g. submitting a quiz
// with questions still unanswered).
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-xl border border-surface-border bg-surface-raised p-6 shadow-xl">
        <h2 className="mb-2 text-lg font-bold text-ink">{title}</h2>
        <p className="mb-6 text-sm leading-relaxed text-ink-muted">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted hover:border-neutral-600"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-[#1D4ED8] px-4 py-2 text-sm font-medium text-surface"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
