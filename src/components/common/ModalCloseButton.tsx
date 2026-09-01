// The small "x" in the top-right corner of every modal / popup in the app.
// Position it inside a panel that is `relative`.
export function ModalCloseButton({
  onClose,
  label = 'Close',
}: {
  onClose: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={label}
      className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-lg leading-none text-ink-faint transition-colors hover:bg-black/5 hover:text-ink dark:hover:bg-white/10"
    >
      &times;
    </button>
  );
}
