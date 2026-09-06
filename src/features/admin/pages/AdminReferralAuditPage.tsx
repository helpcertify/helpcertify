import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../api/adminApi';
import { useUiStore } from '@/store/useUiStore';
import { toDate } from '@/utils/formatDate';
import { errorText } from '@/lib/errorMessages';

function formatDate(ts: unknown): string {
  return toDate(ts).toLocaleDateString();
}

const STATUS_BADGE: Record<string, string> = {
  invited: 'bg-surface-sunken text-ink-faint',
  registered: 'bg-brand-500/15 text-brand-ink',
  purchased: 'bg-brand-500/15 text-brand-ink',
  pending: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  rewarded: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  rejected: 'bg-red-500/15 text-red-500',
  reversed: 'bg-red-500/15 text-red-500',
  expired: 'bg-surface-sunken text-ink-faint',
};

// Item 15's admin audit view - every referral, both directions of PII
// visible here (referrer + referee name/email), unlike the learner-facing
// Refer & Earn section which never shows the other party's identity (see
// ReferAndEarnSection.tsx). Item 11's minimal refund action lives in the
// detail panel, since a refund is most often initiated *because of* a
// referral looking wrong in this exact list.
export function AdminReferralAuditPage() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const { data } = useQuery({ queryKey: ['admin', 'referrals'], queryFn: adminApi.listReferralsAdmin });
  const referrals = data?.referrals ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [refundAmount, setRefundAmount] = useState('');

  const selected = referrals.find((r) => r.id === selectedId) ?? null;

  const refundMutation = useMutation({
    mutationFn: (orderId: string) => {
      const rupees = parseFloat(refundAmount.trim());
      const amountMinor = Number.isFinite(rupees) && rupees > 0 ? Math.round(rupees * 100) : undefined;
      return adminApi.refundOrder(orderId, refundReason.trim(), amountMinor);
    },
    onSuccess: () => {
      pushToast('Order refunded', 'success');
      setRefundReason('');
      setRefundAmount('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'referrals'] });
    },
    onError: (err) => pushToast(errorText(err, 'Could not refund that order'), 'error'),
  });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-ink">Referral Audit</h1>
      <p className="mb-6 text-sm text-ink-faint">Every Refer &amp; Earn referral, its status, and its reward.</p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="overflow-x-auto rounded-xl border border-surface-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-sunken text-ink-faint text-xs uppercase tracking-wide text-ink-faint">
              <tr>
                <th className="px-4 py-3">Referrer</th>
                <th className="px-4 py-3">Referee</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {referrals.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-ink-faint">
                    No referrals yet.
                  </td>
                </tr>
              )}
              {referrals.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className={`cursor-pointer border-t border-surface-border hover:bg-surface-sunken ${
                    selectedId === r.id ? 'bg-brand-500/10' : ''
                  }`}
                >
                  <td className="px-4 py-3 text-ink">
                    {r.referrerName}
                    <div className="text-xs text-ink-faint">{r.referrerEmail}</div>
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{r.refereeName}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${STATUS_BADGE[r.status] ?? 'bg-surface-sunken text-ink-faint'}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink-faint">{formatDate(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-surface-border bg-surface-raised p-5">
          {!selected ? (
            <p className="text-sm text-ink-faint">Select a referral to see its full detail and reward.</p>
          ) : (
            <div className="space-y-3 text-sm">
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-ink-faint">Referrer</div>
                <div className="text-ink">{selected.referrerName}</div>
                <div className="text-ink-faint">{selected.referrerEmail}</div>
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-ink-faint">Referee</div>
                <div className="text-ink">{selected.refereeName}</div>
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-ink-faint">Status</div>
                <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${STATUS_BADGE[selected.status] ?? 'bg-surface-sunken text-ink-faint'}`}>
                  {selected.status}
                </span>
              </div>
              {selected.rejectionReason && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide text-ink-faint">Reason</div>
                  <div className="text-ink-muted">{selected.rejectionReason}</div>
                </div>
              )}
              {selected.qualifyingOrderId && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide text-ink-faint">Qualifying Order</div>
                  <div className="font-mono text-xs text-ink-muted">{selected.qualifyingOrderId}</div>
                </div>
              )}
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-ink-faint">Timestamps</div>
                <div className="text-ink-muted">Created: {formatDate(selected.createdAt)}</div>
                {selected.rewardedAt && <div className="text-ink-muted">Rewarded: {formatDate(selected.rewardedAt)}</div>}
              </div>

              {selected.qualifyingOrderId && (selected.status === 'pending' || selected.status === 'rewarded') && (
                <div className="border-t border-surface-border pt-3">
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink-faint">Refund this order</label>
                  <textarea
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    rows={2}
                    placeholder="Reason (required)"
                    className="input-dark mb-2"
                  />
                  <input
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    inputMode="decimal"
                    placeholder="Amount in ₹ (blank = full refund)"
                    className="input-dark mb-2"
                  />
                  <button
                    type="button"
                    disabled={!refundReason.trim() || refundMutation.isPending}
                    onClick={() => refundMutation.mutate(selected.qualifyingOrderId!)}
                    className="w-full rounded-lg border border-red-500/50 py-2 text-sm text-red-400 disabled:opacity-50"
                  >
                    {refundMutation.isPending ? 'Refunding…' : 'Refund & Reverse Referral'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
