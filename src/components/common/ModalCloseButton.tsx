// The small "x" in the top-right corner of every modal / popup in the app.
// Position it inside a panel that is `relative`. `className` REPLACES the
// default color classes (never merge/append - conflicting bg-*/text-*
// utilities in one class list have unpredictable specificity) - pass it
// only for a non-default backdrop, e.g. a colored hero band.
export function ModalCloseButton({
  onClose,
  label = 'Close',
  className,
}: {
  onClose: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={label}
      className={`absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-lg leading-none transition-colors ${
        className ?? 'bg-surface-sunken text-ink-faint hover:bg-surface-border hover:text-ink'
      }`}
    >
      &times;
    </button>
  );
}
