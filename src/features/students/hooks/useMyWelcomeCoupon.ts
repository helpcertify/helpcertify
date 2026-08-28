import { useQuery } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { toDate } from '@/utils/formatDate';
import type { ReferralDoc } from '@/types/models';

export interface MyWelcomeCoupon {
  code: string;
  type: 'flat' | 'percent';
  value: number;
}

// Refer & Earn — this account's own welcome coupon, if it was created via
// someone else's referral link, shared by both StudentHomePage's banner
// and ReferAndEarnSection's (My Profile) banner so the "already used"
// check doesn't get duplicated. The referrals/{myUid} doc (as referee) is
// the same doc api/auth.ts's linkReferral wrote at signup, not a second
// source of truth; the coupons/{code} doc's own usedCount is what
// actually says whether it's been redeemed yet (both doc reads are
// allowed by firestore.rules for the account they belong to). Returns
// undefined while loading, null once loaded if there's nothing to show
// (no referral, or the coupon's already been used/expired/deactivated).
export function useMyWelcomeCoupon() {
  const firebaseUser = useAuthStore((s) => s.firebaseUser);

  return useQuery({
    queryKey: ['student', 'myWelcomeCoupon', firebaseUser?.uid],
    queryFn: async (): Promise<MyWelcomeCoupon | null> => {
      const referralSnap = await getDoc(doc(db, 'referrals', firebaseUser!.uid));
      const referral = referralSnap.data() as ReferralDoc | undefined;
      if (!referral?.refereeCouponCode) return null;

      const couponSnap = await getDoc(doc(db, 'coupons', referral.refereeCouponCode));
      const coupon = couponSnap.data();
      // Gone, already used, deactivated, or expired — nothing left to
      // announce. maxUses is always 1 for this coupon (see linkReferral),
      // so usedCount > 0 means it's already been redeemed.
      if (!coupon || !coupon.active || (coupon.usedCount ?? 0) > 0) return null;
      if (coupon.expiresAt && toDate(coupon.expiresAt).getTime() < Date.now()) return null;

      return {
        code: referral.refereeCouponCode,
        type: referral.refereeRewardType ?? 'flat',
        value: referral.refereeRewardValue ?? 0,
      };
    },
    enabled: !!firebaseUser?.uid,
  });
}
