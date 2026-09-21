import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { cartApi } from '../api/cartApi';
import { formatMoney } from '@/utils/currency';

// A plain nudge back to checkout when the learner has real, unpurchased
// items sitting in their cart right now - the actual item count, titles,
// and total, never a countdown or fabricated urgency ("only 2 left!").
// Self-sufficient like WelcomeCouponBanner: queries the same
// ['student','cart'] key every other page already populates (React Query
// dedupes), and hides itself the instant the cart is empty.
export function CartReminderBanner({ className = '' }: { className?: string }) {
  const { data: cart } = useQuery({ queryKey: ['student', 'cart'], queryFn: cartApi.getCart });
  const items = cart?.items ?? [];
  if (!cart || items.length === 0) return null;

  const itemNoun = items.length === 1 ? 'item' : 'items';
  const summary = items.length === 1 ? items[0].title : `${items[0].title} and ${items.length - 1} more`;

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-500/30 bg-brand-50 px-4 py-3 ${className}`}
    >
      <div className="min-w-0 text-sm">
        <span className="font-bold text-brand-ink">
          🛒 {items.length} {itemNoun} waiting in your cart
        </span>
        <span className="ml-1 text-ink-muted">
          · {summary} · {formatMoney(cart.total, cart.currency)}
        </span>
      </div>
      <Link
        to="/home/cart"
        className="shrink-0 rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
      >
        Go to Cart
      </Link>
    </div>
  );
}
