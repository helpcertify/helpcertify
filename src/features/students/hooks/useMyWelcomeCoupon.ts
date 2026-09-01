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

// Refer & Earn - this account's own welcome coupon, if it was created via
// someone else's referral link, shared by both StudentHomePage's banner
// and ReferAndEarnSection's (My Profile) banner so the "already used"
// check doesn't get duplicated. The referrals/{myUid} doc (as referee) is
// the same doc api/auth.ts's linkReferral wrote at signup, not a second
// source of truth; the coupons/{code} doc's own usedCount is what
// actually says whether it's been redeemed yet (both doc reads are
// allowed by firestore.rules for the account they belong to). Returns
// undefined while loading, null once loaded if there's nothing to show
// (no referral, or the coupon's already been used/expired/deactivated) -
// every null branch below logs *why*, since a silent null here is
// otherwise indistinguishable from "nothing to show" vs. "something's
// actually broken" (e.g. a Firestore rules mismatch throwing instead of
// resolving) from the outside.
export function useMyWelcomeCoupon() {
  const firebaseUser = useAuthStore((s) => s.firebaseUser);

  return useQuery({
    queryKey: ['student', 'myWelcomeCoupon', firebaseUser?.uid],
    queryFn: async (): Promise<MyWelcomeCoupon | null> => {
      try {
        const referralSnap = await getDoc(doc(db, 'referrals', firebaseUser!.uid));
        const referral = referralSnap.data() as ReferralDoc | undefined;
        if (!referral) {
          console.info('useMyWelcomeCoupon: no referrals doc for this account (never used a referral link).');
          return null;
        }
        if (!referral.refereeCouponCode) {
          console.info('useMyWelcomeCoupon: referral doc exists but has no refereeCouponCode (predates this field).');
          return null;
        }

        const couponSnap = await getDoc(doc(db, 'coupons', referral.refereeCouponCode));
        const coupon = couponSnap.data();
        if (!coupon) {
          console.warn(`useMyWelcomeCoupon: coupon doc "${referral.refereeCouponCode}" doesn't exist.`);
          return null;
        }
        if (!coupon.active) {
          console.info(`useMyWelcomeCoupon: coupon "${referral.refereeCouponCode}" is deactivated.`);
          return null;
        }
        // maxUses is always 1 for this coupon (see linkReferral), so
        // usedCount > 0 means it's already been redeemed.
        if ((coupon.usedCount ?? 0) > 0) {
          console.info(`useMyWelcomeCoupon: coupon "${referral.refereeCouponCode}" has already been used.`);
          return null;
        }
        if (coupon.expiresAt && toDate(coupon.expiresAt).getTime() < Date.now()) {
          console.info(`useMyWelcomeCoupon: coupon "${referral.refereeCouponCode}" has expired.`);
          return null;
        }

        return {
          code: referral.refereeCouponCode,
          type: referral.refereeRewardType ?? 'flat',
          value: referral.refereeRewardValue ?? 0,
        };
      } catch (err) {
        // Most likely a Firestore permission-denied - logged loudly rather
        // than left as a silent, unexplained missing banner.
        console.error('useMyWelcomeCoupon: failed to check welcome-coupon status', err);
        return null;
      }
    },
    enabled: !!firebaseUser?.uid,
  });
}
