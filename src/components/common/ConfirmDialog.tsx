import { ModalCloseButton } from './ModalCloseButton';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  // Red confirm button for a permanent-delete action, instead of the
  // default brand blue used for a general "are you sure" step (e.g.
  // submitting a quiz with questions still unanswered) - added so the
  // three admin delete confirmations that used to be the browser's native
  // window.confirm() (a different font/color/button style from the rest of
  // the app) can reuse this same dialog instead of introducing a second one.
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// Generic yes/no modal - used wherever an action needs a friendly "are you
// sure" step before something irreversible happens (e.g. submitting a quiz
// with questions still unanswered, or an admin deleting a quiz/practice
// test/attempt).
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" role="dialog" aria-modal="true">
      <div className="relative w-full max-w-sm rounded-xl border border-surface-border bg-surface-raised p-6 shadow-xl">
        <ModalCloseButton onClose={onCancel} />
        <h2 className="mb-2 pr-8 text-lg font-bold text-ink">{title}</h2>
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
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              danger ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-[#155EEF] text-surface'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
