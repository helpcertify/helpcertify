import { useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { authApi } from '@/features/auth/api/authApi';
import { useUiStore } from '@/store/useUiStore';
import { WelcomeCouponBanner } from './WelcomeCouponBanner';
import { toDate } from '@/utils/formatDate';
import { formatReward } from '@/utils/currency';
import type { ReferralDoc } from '@/types/models';

// Refer & Earn — the referral code is lazily backfilled the first time this
// section mounts (ensureReferralCode is a no-op once one's already set, so
// this is safe to call on every visit). The reward itself is granted
// server-side only once a referred signup completes their first paid
// order (see api/checkout.ts's/api/razorpay-webhook.ts's
// grantReferralRewardIfEligible) — this section only ever displays what
// already happened, it never grants anything itself.
export function ReferAndEarnSection() {
  const profile = useAuthStore((s) => s.profile);
  const firebaseUser = useAuthStore((s) => s.firebaseUser);
  const setSession = useAuthStore((s) => s.setSession);
  const pushToast = useUiStore((s) => s.pushToast);

  const ensureCodeMutation = useMutation({
    mutationFn: authApi.ensureReferralCode,
    onSuccess: ({ referralCode }) => {
      if (firebaseUser && profile) setSession(firebaseUser, { ...profile, referralCode });
    },
  });

  // Fire once, only for an account that doesn't have a code yet — every
  // account created after this feature shipped already gets one at signup,
  // so this mutation only ever actually writes for a pre-existing account.
  useEffect(() => {
    if (profile && !profile.referralCode && !ensureCodeMutation.isPending) {
      ensureCodeMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.referralCode]);

  const { data: referrals } = useQuery({
    queryKey: ['student', 'myReferrals', firebaseUser?.uid],
    queryFn: async () => {
      const snap = await getDocs(query(collection(db, 'referrals'), where('referrerUid', '==', firebaseUser!.uid)));
      return snap.docs.map((d) => d.data() as ReferralDoc).sort((a, b) => toDate(b.createdAt).getTime() - toDate(a.createdAt).getTime());
    },
    enabled: !!firebaseUser?.uid,
  });

  if (!profile) return null;

  const referralLink = profile.referralCode ? `${window.location.origin}/register?ref=${profile.referralCode}` : null;

  const handleCopy = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      pushToast('Referral link copied', 'success');
    } catch {
      pushToast('Could not copy. Select and copy the link manually.', 'error');
    }
  };

  return (
    <div className="mb-6 rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-[0_2px_8px_rgba(15,23,42,0.05)] dark:bg-surface-raised">
      <h2 className="mb-1 text-[15px] font-bold uppercase tracking-wide text-[#155EEF]">🎁 Refer & Earn</h2>
      <p className="mb-4 text-sm text-[#64748B]">
        Share your link with friends. When someone signs up and makes their first purchase, you get a reward coupon.
      </p>

      <WelcomeCouponBanner className="mb-5" />

      <div className="mb-5 flex flex-col gap-2 rounded-lg border border-[#BFDBFE] bg-[#EFF6FF] p-3 sm:flex-row sm:items-center">
        <input
          readOnly
          value={referralLink ?? 'Generating your referral link…'}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 truncate rounded-lg border border-[#BFDBFE] bg-white px-3 py-2 text-sm text-[#0F172A]"
        />
        <button
          type="button"
          onClick={handleCopy}
          disabled={!referralLink}
          className="shrink-0 rounded-lg bg-[#155EEF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#004EEB] disabled:opacity-60"
        >
          Copy Link
        </button>
      </div>

      <div className="text-xs font-bold uppercase tracking-wide text-[#64748B]">Your Referrals</div>
      {!referrals || referrals.length === 0 ? (
        <p className="mt-2 text-sm text-[#64748B]">No referrals yet. Share your link to start earning.</p>
      ) : (
        <div className="mt-2 space-y-2">
          {referrals.map((r) => (
            <div
              key={r.refereeUid}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#E2E8F0] px-3 py-2.5"
            >
              <div>
                <div className="text-sm font-semibold text-[#0F172A]">{r.refereeName}</div>
                <div className="text-xs text-[#64748B]">{toDate(r.createdAt).toLocaleDateString()}</div>
              </div>
              {r.status === 'rewarded' ? (
                <div className="text-right">
                  <div className="text-sm font-bold text-[#16A34A]">
                    {formatReward(r.rewardType ?? 'flat', r.rewardValue ?? 0)} off coupon earned
                  </div>
                  <div className="text-xs text-[#64748B]">Code: {r.couponCode}</div>
                </div>
              ) : (
                <span className="rounded-full bg-[#FEF3C7] px-2.5 py-1 text-xs font-semibold text-[#92400E]">Pending first purchase</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
