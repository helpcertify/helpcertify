import clsx from 'clsx';

// Button styling, split out from Button.tsx so a <Link> can be styled as a
// button (`className={buttonClasses('primary')}`) without importing a
// component, and so the fast-refresh rule is happy.
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700',
  secondary: 'border border-brand-500 bg-surface-raised text-brand-ink hover:bg-brand-50',
  ghost: 'text-ink-muted hover:bg-surface-sunken',
  danger: 'border border-surface-border-strong text-danger hover:border-danger hover:bg-danger-soft',
  success: 'bg-success text-white hover:opacity-90',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'gap-1.5 px-3 py-1.5 text-xs',
  md: 'gap-2 px-4 py-2 text-sm',
  lg: 'gap-2 px-5 py-2.5 text-sm',
};

export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  fullWidth = false,
  className = '',
): string {
  return clsx(
    'inline-flex items-center justify-center rounded-lg border border-transparent font-semibold transition-colors',
    'disabled:cursor-not-allowed disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size],
    fullWidth && 'w-full',
    className,
  );
}
