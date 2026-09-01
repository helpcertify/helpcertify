import clsx from 'clsx';
import { Link } from 'react-router-dom';
import logoLockup from '@/assets/logo-lockup.png';

interface LogoProps {
  to?: string;
  size?: 'sm' | 'md';
  className?: string;
}

// The HelpCertify lockup (3D shield-check-cap mark + wordmark). One image so
// the wordmark styling always matches the brand art - see scripts/gen-logo.mjs
// for how it's produced from src/assets/logo-source.png.
export function Logo({ to = '/', size = 'md', className }: LogoProps) {
  const height = size === 'sm' ? 28 : 36;
  const img = (
    <img
      src={logoLockup}
      alt="HelpCertify"
      width={Math.round((height * 263) / 120)}
      height={height}
      className={clsx('object-contain', className)}
      style={{ height, width: 'auto' }}
    />
  );
  return to ? (
    <Link to={to} aria-label="HelpCertify home">
      {img}
    </Link>
  ) : (
    img
  );
}
