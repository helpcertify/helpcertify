import clsx from 'clsx';
import { Link } from 'react-router-dom';
import logoMark from '@/assets/logo-mark.svg';

interface LogoProps {
  to?: string;
  size?: 'sm' | 'md';
  className?: string;
}

// Teal checkmark-and-graduation-cap mark + wordmark — the brand identity.
export function Logo({ to = '/', size = 'md', className }: LogoProps) {
  const content = (
    <span className={clsx('flex items-center gap-2', className)}>
      <img
        src={logoMark}
        alt=""
        className={clsx(size === 'sm' ? 'h-6 w-6' : 'h-8 w-8')}
      />
      <span className={clsx('font-semibold text-ink', size === 'sm' ? 'text-base' : 'text-lg')}>Helpcertify</span>
    </span>
  );
  return to ? <Link to={to}>{content}</Link> : content;
}
