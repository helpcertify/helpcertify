// The small "x" in the top-right corner of every modal / popup in the app.
// Position it inside a panel that is `relative`.
export function ModalCloseButton({ onClose, label = 'Close' }: { onClose: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={label}
      className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/5 text-lg leading-none text-ink-muted transition-colors hover:bg-black/10 hover:text-ink dark:bg-white/10 dark:hover:bg-white/20"
    >
      &times;
    </button>
  );
}
