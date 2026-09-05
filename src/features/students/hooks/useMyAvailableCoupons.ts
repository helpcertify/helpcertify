import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { toDate } from '@/utils/formatDate';
import type { CouponDoc } from '@/types/models';

export interface AvailableCoupon {
  code: string;
  type: 'flat' | 'percent' | 'fixed_price';
  value: number;
}

// Every coupon currently usable by this account - mainly Refer & Earn
// rewards (CouponDoc.restrictedToUserId set to this uid, see api/auth.ts's
// linkReferral and api/checkout.ts's/api/razorpay-webhook.ts's
// grantReferralRewardIfEligible), but this naturally covers any other
// account-restricted coupon too, not just referral ones specifically.
// Shown at checkout (Cart and Buy Now) so a learner doesn't have to
// remember or go find a code they've already earned. Firestore rules only
// ever let this query return coupons restricted to the signed-in account
// (see firestore.rules' coupons/{code} rule) - a regular admin-created,
// not-restricted-to-anyone coupon never shows up here.
export function useMyAvailableCoupons() {
  const firebaseUser = useAuthStore((s) => s.firebaseUser);

  return useQuery({
    queryKey: ['student', 'myAvailableCoupons', firebaseUser?.uid],
    queryFn: async (): Promise<AvailableCoupon[]> => {
      const snap = await getDocs(
        query(collection(db, 'coupons'), where('restrictedToUserId', '==', firebaseUser!.uid), where('active', '==', true))
      );
      const now = Date.now();
      return snap.docs
        .map((d) => ({ code: d.id, ...(d.data() as CouponDoc) }))
        .filter((c) => (c.usedCount ?? 0) < (c.maxUses ?? Infinity))
        .filter((c) => !c.expiresAt || toDate(c.expiresAt).getTime() >= now)
        .map((c) => ({ code: c.code, type: c.discountType, value: c.discountValue }));
    },
    enabled: !!firebaseUser?.uid,
  });
}
