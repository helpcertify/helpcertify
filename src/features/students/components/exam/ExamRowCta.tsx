import { Link } from 'react-router-dom';
import { buttonClasses } from '@/components/ui';
import type { CtaSpec } from './examCta';

// Renders the single right-aligned action on a PracticeSetRow / MockExamRow
// (and reused on the browse card) for a non-locked item. A locked item never
// reaches this component - see examCta's comment.
export function ExamRowCta({ cta, size = 'sm', fullWidth = false }: { cta: CtaSpec; size?: 'sm' | 'md'; fullWidth?: boolean }) {
  const cls = buttonClasses(cta.variant, size, fullWidth);
  return (
    <Link to={cta.href} className={cls} onClick={(e) => e.stopPropagation()}>
      {cta.label}
    </Link>
  );
}
