import { useEffect, useState } from 'react';

// Respects the OS/browser "reduce motion" accessibility setting. No
// animation library dependency - just the standard matchMedia query, kept
// live via its change event so toggling the OS setting updates immediately
// without a page reload.
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
