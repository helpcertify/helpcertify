import { Button } from '@/components/ui';
import { ModalCloseButton } from './ModalCloseButton';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  // Red confirm button for a permanent-delete action, instead of the
  // default brand blue used for a general "are you sure" step.
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// Generic yes/no modal - used wherever an action needs a friendly "are you
// sure" step before something irreversible happens.
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-sm rounded-xl border border-surface-border bg-surface-raised p-6 shadow-pop">
        <ModalCloseButton onClose={onCancel} />
        <h2 className="mb-2 pr-8 text-lg font-bold text-ink">{title}</h2>
        <p className="mb-6 text-sm leading-relaxed text-ink-muted">{message}</p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
