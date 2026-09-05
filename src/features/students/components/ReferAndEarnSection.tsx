import { useEffect, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { authApi } from '@/features/auth/api/authApi';
import { useUiStore } from '@/store/useUiStore';
import { WelcomeCouponBanner } from './WelcomeCouponBanner';
import { useMyCredits } from '../hooks/useMyCredits';
import { toDate } from '@/utils/formatDate';
import { formatMoney } from '@/utils/currency';
import type { ReferralDoc, ReferralStatus } from '@/types/models';
import { errorText } from '@/lib/errorMessages';

// One label + color per lifecycle stage (see ReferralDoc's own comment for
// what each status means). 'invited' has no real trigger in this app
// today (no page-view tracking) - kept here for completeness, in case a
// referral doc is ever manually seeded into it.
const STATUS_META: Record<ReferralStatus, { label: string; className: string }> = {
  invited: { label: 'Invited', className: 'bg-surface-raised text-ink-faint' },
  registered: { label: 'Signed up', className: 'bg-brand-50 text-brand-ink' },
  purchased: { label: 'Purchased', className: 'bg-brand-50 text-brand-ink' },
  pending: { label: 'Pending validation', className: 'bg-warning-soft text-warning' },
  rewarded: { label: 'Rewarded', className: 'bg-success-soft text-success' },
  rejected: { label: 'Not eligible', className: 'bg-danger-soft text-danger' },
  reversed: { label: 'Reversed', className: 'bg-danger-soft text-danger' },
  expired: { label: 'Expired', className: 'bg-surface-raised text-ink-faint' },
};

// Refer & Earn - the referral code is lazily backfilled the first time this
// section mounts (ensureReferralCode is a no-op once one's already set, so
// this is safe to call on every visit). Every reward is granted server-
// side only (see api/checkout.ts's/api/razorpay-webhook.ts's
// processReferralOnPurchase) - this section only ever displays what
// already happened, it never grants anything itself. The referral list
// below deliberately never shows the referred person's name (item 16 -
// no PII in the learner-facing dashboard); the admin audit view is the
// only place that's shown (see AdminReferralAuditPage.tsx).
export function ReferAndEarnSection() {
  const profile = useAuthStore((s) => s.profile);
  const firebaseUser = useAuthStore((s) => s.firebaseUser);
  const setSession = useAuthStore((s) => s.setSession);
  const pushToast = useUiStore((s) => s.pushToast);
  const [applyCodeInput, setApplyCodeInput] = useState('');

  const ensureCodeMutation = useMutation({
    mutationFn: authApi.ensureReferralCode,
    onSuccess: ({ referralCode }) => {
      if (firebaseUser && profile) setSession(firebaseUser, { ...profile, referralCode });
    },
  });

  // Fire once, only for an account that doesn't have a code yet - every
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

  const { data: credits } = useMyCredits();
  const creditByReferralId = new Map((credits?.entries ?? []).map((e) => [e.referralId, e]));

  // Item 4/5 - a code can still be applied here if this account registered
  // without one, as long as it hasn't purchased anything yet (enforced
  // server-side; this button just surfaces the flow).
  const applyCodeMutation = useMutation({
    mutationFn: () => authApi.applyReferralCode(applyCodeInput.trim()),
    onSuccess: (result) => {
      if (result.success) {
        pushToast('Referral code applied!', 'success');
        setApplyCodeInput('');
      } else {
        pushToast(result.reason, 'error');
      }
    },
    onError: (err) => pushToast(errorText(err, 'Could not apply that code'), 'error'),
  });

  if (!profile) return null;

  const referralLink = profile.referralCode ? `${window.location.origin}/register?ref=${profile.referralCode}` : null;
  // Whether *this* account was itself referred - the "apply a code" input
  // only makes sense before that's ever happened.
  const wasReferred = referrals !== undefined && referrals.some((r) => r.refereeUid === firebaseUser?.uid);

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
    <div className="mb-6 rounded-xl border border-surface-border bg-surface-raised p-6 shadow-card">
      <h2 className="mb-1 text-[15px] font-bold uppercase tracking-wide text-brand-ink">🎁 Refer & Earn</h2>
      <p className="mb-4 text-sm text-ink-faint">
        Share your link with friends. When someone signs up and makes their first eligible purchase, you get
        HelpCertify credit.
      </p>

      <WelcomeCouponBanner className="mb-5" />

      {credits && credits.spendableMinor > 0 && (
        <div className="mb-5 rounded-lg border border-brand-500/30 bg-brand-50 p-3">
          <div className="text-sm font-bold text-brand-ink">💳 {formatMoney(credits.spendableMinor, 'INR')} HelpCertify credit available</div>
          <div className="text-xs text-ink-faint">Non-withdrawable, use it at checkout, up to a percentage of your order.</div>
        </div>
      )}

      <div className="mb-5 flex flex-col gap-2 rounded-lg border border-brand-500/30 bg-brand-50 p-3 sm:flex-row sm:items-center">
        <input
          readOnly
          value={referralLink ?? 'Generating your referral link…'}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 truncate rounded-lg border border-brand-500/30 bg-surface-raised px-3 py-2 text-sm text-ink"
        />
        <button
          type="button"
          onClick={handleCopy}
          disabled={!referralLink}
          className="shrink-0 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
        >
          Copy Link
        </button>
      </div>

      {!wasReferred && (
        <div className="mb-5">
          <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-faint">Have a referral code?</div>
          <div className="flex gap-2">
            <input
              value={applyCodeInput}
              onChange={(e) => setApplyCodeInput(e.target.value)}
              placeholder="Enter a friend's code"
              className="input-dark flex-1"
            />
            <button
              type="button"
              disabled={!applyCodeInput.trim() || applyCodeMutation.isPending}
              onClick={() => applyCodeMutation.mutate()}
              className="rounded-lg border border-surface-border px-4 py-2 text-sm font-semibold text-ink-muted disabled:opacity-50"
            >
              Apply
            </button>
          </div>
          <p className="mt-1 text-xs text-ink-faint">Only works before your first purchase.</p>
        </div>
      )}

      <div className="text-xs font-bold uppercase tracking-wide text-ink-faint">Your Referrals</div>
      {!referrals || referrals.length === 0 ? (
        <p className="mt-2 text-sm text-ink-faint">No referrals yet. Share your link to start earning.</p>
      ) : (
        <div className="mt-2 space-y-2">
          {referrals.map((r, i) => {
            const meta = STATUS_META[r.status] ?? STATUS_META.registered;
            const creditEntry = r.creditEntryId ? creditByReferralId.get(r.refereeUid) : undefined;
            return (
              <div
                key={r.refereeUid}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-surface-border px-3 py-2.5"
              >
                <div>
                  {/* Referral #N, not the referred person's name - item 16 */}
                  <div className="text-sm font-semibold text-ink">Referral #{referrals.length - i}</div>
                  <div className="text-xs text-ink-faint">{toDate(r.createdAt).toLocaleDateString()}</div>
                </div>
                <div className="text-right">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${meta.className}`}>{meta.label}</span>
                  {creditEntry && (r.status === 'pending' || r.status === 'rewarded') && (
                    <div className="mt-1 text-xs text-ink-faint">
                      {formatMoney(creditEntry.amountMinor, 'INR')} credit{r.status === 'pending' ? ' (pending validation)' : ''}
                    </div>
                  )}
                  {r.status === 'rejected' && r.rejectionReason && <div className="mt-1 text-xs text-ink-faint">{r.rejectionReason}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
