import { Link } from 'react-router-dom';

// A short row of real, already-true reasons to trust the purchase - no
// fabricated stats (enrollment counts, review totals, countdowns) that
// aren't backed by real data. Shown just under/inside the purchase panel
// on a product detail page, next to the Buy button where it can actually
// influence the decision.
export function TrustBadgeStrip({ className = '' }: { className?: string }) {
  const items = [
    { icon: '🎓', label: 'Certificate on completion' },
    { icon: '🔒', label: 'Secure checkout via Razorpay' },
    { icon: '↩', label: 'Refund & Cancellation Policy', to: '/refund' },
  ];
  return (
    <ul className={`flex flex-col gap-1.5 text-xs text-ink-faint ${className}`}>
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span aria-hidden="true">{item.icon}</span>
          {item.to ? (
            <Link to={item.to} target="_blank" rel="noopener noreferrer" className="hover:text-brand-ink hover:underline">
              {item.label}
            </Link>
          ) : (
            <span>{item.label}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
