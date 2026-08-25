import clsx from 'clsx';
import { Link } from 'react-router-dom';

interface LogoProps {
  to?: string;
  size?: 'sm' | 'md';
  className?: string;
}

// Circular teal "H" mark + wordmark — the v2 brand identity (replaces the
// reference screenshots' "Zero Sphere" branding; this app is Helpcertify).
export function Logo({ to = '/', size = 'md', className }: LogoProps) {
  const content = (
    <span className={clsx('flex items-center gap-2', className)}>
      <span
        className={clsx(
          'flex items-center justify-center rounded-full bg-brand-gradient font-bold text-surface',
          size === 'sm' ? 'h-6 w-6 text-xs' : 'h-8 w-8 text-sm'
        )}
      >
        H
      </span>
      <span className={clsx('font-semibold text-ink', size === 'sm' ? 'text-base' : 'text-lg')}>Helpcertify</span>
    </span>
  );
  return to ? <Link to={to}>{content}</Link> : content;
}
