import type { ButtonHTMLAttributes } from 'react';

// Single source of truth for button appearance across the app - every page
// used to hand-roll its own className string, which is how "Next" ended up
// a slightly different border-gray from "Previous" ended up a slightly
// different border-gray from "Cancel". The variants below are semantic, not
// decorative: primary is the main CTA, success/info are the deliberately
// distinct green/blue used on the practice/quiz Next-vs-Finish buttons
// (mobile mis-tap fix - kept as named variants here rather than flattened
// into one color, since that distinction was the point), danger is for
// destructive actions, secondary/ghost are low-emphasis.
export type ButtonVariant = 'primary' | 'secondary' | 'success' | 'info' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-[#155EEF] text-white hover:bg-[#004EEB] active:bg-[#003DB8]',
  secondary: 'border border-[#155EEF] text-[#155EEF] bg-surface hover:bg-[#EFF6FF]',
  success: 'bg-emerald-600 text-white hover:bg-emerald-500',
  info: 'bg-[#155EEF] text-white hover:bg-[#004EEB] active:bg-[#003DB8]',
  danger: 'border border-surface-border text-[#DC2626] hover:border-red-500/50',
  ghost: 'text-ink-muted hover:bg-surface-raised',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-2.5 text-sm',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  type = 'button',
  className = '',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    />
  );
}
