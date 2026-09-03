import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { partnerApi } from '../api/partnerApi';
import { useUiStore } from '@/store/useUiStore';
import { errorText } from '@/lib/errorMessages';
import { formatMoney } from '@/utils/currency';

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  PENDING_HOLD: { text: 'In hold period', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  ON_HOLD: { text: 'Under review', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  APPROVED: { text: 'Approved', cls: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
  PAYABLE: { text: 'Ready for payout', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  PROCESSING: { text: 'Payout processing', cls: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
  PAID: { text: 'Paid', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  REVERSED: { text: 'Reversed (refund)', cls: 'bg-red-500/15 text-red-500' },
  RECOVERABLE: { text: 'Recoverable (refund)', cls: 'bg-red-500/15 text-red-500' },
  REJECTED: { text: 'Rejected', cls: 'bg-red-500/15 text-red-500' },
};

export function PartnerDashboardPage() {
  const pushToast = useUiStore((s) => s.pushToast);
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState<string | null>(null);

  const codes = useQuery({ queryKey: ['partner', 'myCodes'], queryFn: partnerApi.listMyReferralCodes });
  const commissions = useQuery({ queryKey: ['partner', 'myCommissions'], queryFn: partnerApi.listMyCommissions });

  const createCode = useMutation({
    mutationFn: partnerApi.createReferralCode,
    onSuccess: () => {
      pushToast('New referral code created', 'success');
      queryClient.invalidateQueries({ queryKey: ['partner', 'myCodes'] });
    },
    onError: (err) => pushToast(errorText(err, 'Could not create a code'), 'error'),
  });

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://helpcertify.com';
  const activeCodes = useMemo(() => (codes.data?.codes ?? []).filter((c) => c.active), [codes.data]);
  const totals = commissions.data?.totals;

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 1500);
    } catch {
      pushToast('Could not copy to clipboard', 'error');
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-2xl font-bold text-ink">Partner dashboard</h1>
      <p className="mb-6 text-sm text-ink-faint">Your referral links and commission earnings.</p>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'In hold', value: totals?.pendingMinor },
          { label: 'Ready for payout', value: totals?.payableMinor },
          { label: 'Paid out', value: totals?.paidMinor },
          { label: 'Reversed', value: totals?.reversedMinor },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-surface-border bg-surface-raised px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-ink-faint">{s.label}</p>
            <p className="mt-1 text-lg font-bold text-ink">{formatMoney(s.value ?? 0, 'INR')}</p>
          </div>
        ))}
      </div>

      <div className="mb-8 rounded-xl border border-surface-border bg-surface-raised p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-faint">Referral links</h2>
          <button
            type="button"
            disabled={createCode.isPending}
            onClick={() => createCode.mutate()}
            className="rounded border border-surface-border px-3 py-1 text-xs text-ink-muted disabled:opacity-50"
          >
            New code
          </button>
        </div>
        {codes.isLoading ? (
          <p className="text-sm text-ink-faint">Loading…</p>
        ) : activeCodes.length === 0 ? (
          <p className="text-sm text-ink-faint">No active codes yet.</p>
        ) : (
          <ul className="space-y-3">
            {activeCodes.map((c) => {
              const link = `${origin}/?ref=${c.code}`;
              return (
                <li key={c.code} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <span className="font-mono text-sm font-semibold text-ink">{c.code}</span>
                    <span className="ml-2 break-all text-xs text-ink-faint">{link}</span>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => copy(c.code, `c-${c.code}`)} className="rounded border border-surface-border px-2 py-1 text-xs text-ink-muted">
                      {copied === `c-${c.code}` ? 'Copied' : 'Copy code'}
                    </button>
                    <button type="button" onClick={() => copy(link, `l-${c.code}`)} className="rounded border border-surface-border px-2 py-1 text-xs text-ink-muted">
                      {copied === `l-${c.code}` ? 'Copied' : 'Copy link'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-faint">Commissions</h2>
      <div className="overflow-x-auto rounded-xl border border-surface-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-black/20 text-xs uppercase tracking-wide text-ink-faint">
            <tr>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Base</th>
              <th className="px-4 py-3">Commission</th>
              <th className="px-4 py-3">Hold until</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {(commissions.data?.commissions ?? []).length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-ink-faint" colSpan={5}>
                  No commissions yet. Share your referral link to get started.
                </td>
              </tr>
            )}
            {(commissions.data?.commissions ?? []).map((c) => {
              const s = STATUS_LABEL[c.status] ?? { text: c.status, cls: 'bg-black/20 text-ink-faint' };
              return (
                <tr key={c.id}>
                  <td className="px-4 py-3 font-mono text-xs text-ink-faint">{c.orderId.slice(0, 10)}…</td>
                  <td className="px-4 py-3 text-ink-faint">{formatMoney(c.eligibleBaseMinor, c.currency as 'INR' | 'USD')}</td>
                  <td className="px-4 py-3 font-semibold text-ink">{formatMoney(c.netPayableMinor, c.currency as 'INR' | 'USD')}</td>
                  <td className="px-4 py-3 text-ink-faint">{c.holdUntil ? new Date(c.holdUntil).toLocaleDateString() : '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${s.cls}`}>{s.text}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-ink-faint">
        Commissions are held during the refund window, then released for a monthly payout after finance approval.
        A refunded order reverses its commission.
      </p>
    </div>
  );
}
