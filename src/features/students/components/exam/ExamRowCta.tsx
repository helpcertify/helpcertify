import { Link } from 'react-router-dom';
import { buttonClasses } from '@/components/ui';
import type { CtaSpec } from './examCta';

// Renders the single right-aligned action on a PracticeSetRow / MockExamRow
// (and reused on the browse card). A 'plans' CTA is a button that opens the
// certification plans modal; everything else is a Link into an existing
// route.
export function ExamRowCta({
  cta,
  onViewPlans,
  size = 'sm',
  fullWidth = false,
}: {
  cta: CtaSpec;
  onViewPlans: () => void;
  size?: 'sm' | 'md';
  fullWidth?: boolean;
}) {
  const cls = buttonClasses(cta.variant, size, fullWidth);
  if (cta.action === 'plans') {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onViewPlans();
        }}
        className={cls}
      >
        {cta.label}
      </button>
    );
  }
  return (
    <Link to={cta.href ?? '#'} className={cls} onClick={(e) => e.stopPropagation()}>
      {cta.label}
    </Link>
  );
}
