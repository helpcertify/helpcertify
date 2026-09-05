import { useMyWelcomeCoupon } from '../hooks/useMyWelcomeCoupon';
import { formatReward } from '@/utils/currency';

// Shared by the Home dashboard and My Profile's Refer & Earn section, so a
// referred learner sees the same reminder wherever they land, for as long
// as the coupon is actually still usable - see useMyWelcomeCoupon, which
// stops returning it the moment it's redeemed (or expires/is
// deactivated), so this banner disappears on its own rather than needing
// to be dismissed.
export function WelcomeCouponBanner({ className = '' }: { className?: string }) {
  const { data: myWelcomeCoupon } = useMyWelcomeCoupon();
  if (!myWelcomeCoupon) return null;

  return (
    <div className={`rounded-lg border border-success/40 bg-success-soft p-3 ${className}`}>
      <div className="text-sm font-bold text-success">
        🎉 You have a {formatReward(myWelcomeCoupon.type, myWelcomeCoupon.value)} welcome coupon
      </div>
      <div className="text-xs text-ink-faint">
        Enter code <span className="font-mono font-semibold text-ink">{myWelcomeCoupon.code}</span> at checkout.
      </div>
    </div>
  );
}
