import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { useDialogStore } from '@/store/useDialogStore';
import { ModalCloseButton } from './ModalCloseButton';

// Mounted once at the app root. Renders whatever confirmDialog() /
// promptDialog() last requested as a small, theme-matched popup: a close
// (x) in the top-right, the message spelled out, one primary action and a
// cancel. Esc and the close button both resolve as "cancelled".
export function GlobalDialog() {
  const current = useDialogStore((s) => s.current);
  const resolveConfirm = useDialogStore((s) => s.resolveConfirm);
  const resolvePrompt = useDialogStore((s) => s.resolvePrompt);

  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (current?.kind === 'prompt') {
      setValue(current.opts.defaultValue ?? '');
      setError(null);
    }
  }, [current]);

  const cancel = () => {
    if (!current) return;
    if (current.kind === 'confirm') resolveConfirm(false);
    else resolvePrompt(null);
  };

  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  if (!current) return null;

  const { opts } = current;
  const isPrompt = current.kind === 'prompt';

  const submit = () => {
    if (current.kind === 'confirm') {
      resolveConfirm(true);
      return;
    }
    const v = value.trim();
    const p = current.opts;
    if (p.required && !v) {
      setError('This field is required.');
      return;
    }
    const validationError = p.validate?.(v) ?? null;
    if (validationError) {
      setError(validationError);
      return;
    }
    resolvePrompt(v);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={opts.title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) cancel();
      }}
    >
      <div className="relative w-full max-w-lg rounded-xl border border-surface-border bg-surface-raised p-6 shadow-pop">
        <ModalCloseButton onClose={cancel} label={`Close - ${isPrompt ? 'do not submit' : 'do not proceed'}`} />
        <h2 className="mb-2 pr-8 text-base font-bold text-ink">{opts.title}</h2>
        {opts.message && <p className="whitespace-pre-line text-sm leading-relaxed text-ink-muted">{opts.message}</p>}

        {isPrompt && (
          <div className="mt-3">
            {current.opts.label && (
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-faint">
                {current.opts.label}
              </label>
            )}
            <input
              autoFocus
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
              placeholder={current.opts.placeholder}
              className="input-dark w-full"
            />
            {error && <p className="mt-1 text-xs text-danger">{error}</p>}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2.5">
          <Button variant="ghost" size="sm" onClick={cancel}>
            {opts.cancelLabel ?? 'Cancel'}
          </Button>
          <Button variant={opts.danger ? 'danger' : 'primary'} size="sm" onClick={submit}>
            {opts.confirmLabel ?? (isPrompt ? 'Submit' : 'Confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}
