import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { partnerAdminApi } from '@/features/partner/api/partnerApi';
import { useUiStore } from '@/store/useUiStore';
import { errorText } from '@/lib/errorMessages';
import { formatMoney } from '@/utils/currency';

function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function PayoutsPage() {
  const pushToast = useUiStore((s) => s.pushToast);
  const qc = useQueryClient();
  const [period, setPeriod] = useState(thisMonth());
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [openBatch, setOpenBatch] = useState<string | null>(null);
  const [ref, setRef] = useState('');

  const payable = useQuery({ queryKey: ['admin', 'payable'], queryFn: partnerAdminApi.listPayableCommissions });
  const batches = useQuery({ queryKey: ['admin', 'payoutBatches'], queryFn: partnerAdminApi.listPayoutBatches });
  const batchDetail = useQuery({
    queryKey: ['admin', 'payoutBatch', openBatch],
    queryFn: () => partnerAdminApi.getPayoutBatch({ batchId: openBatch! }),
    enabled: !!openBatch,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'payable'] });
    qc.invalidateQueries({ queryKey: ['admin', 'payoutBatches'] });
    qc.invalidateQueries({ queryKey: ['admin', 'payoutBatch'] });
  };

  const create = useMutation({
    mutationFn: () => {
      const ids = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
      return partnerAdminApi.createPayoutBatch({ periodLabel: period, partnerIds: ids.length ? ids : undefined });
    },
    onSuccess: (r) => {
      pushToast(`Batch created: ${r.partnerCount} partner(s), ${formatMoney(r.grossMinor, 'INR')}`, 'success');
      setSelected({});
      invalidate();
    },
    onError: (e) => pushToast(errorText(e, 'Could not create the batch'), 'error'),
  });

  const act = useMutation({
    mutationFn: (v: { kind: 'approve' | 'paid' | 'cancel'; batchId: string }) => {
      if (v.kind === 'approve') return partnerAdminApi.approvePayoutBatch({ batchId: v.batchId });
      if (v.kind === 'cancel') return partnerAdminApi.cancelPayoutBatch({ batchId: v.batchId });
      return partnerAdminApi.recordPayoutBatchPaid({ batchId: v.batchId, externalReference: ref.trim() });
    },
    onSuccess: () => {
      pushToast('Batch updated', 'success');
      setRef('');
      invalidate();
    },
    onError: (e) => pushToast(errorText(e, 'Could not update the batch'), 'error'),
  });

  const groups = payable.data?.groups ?? [];
  const min = payable.data?.minPayoutMinor ?? 50000;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-ink">Partner payouts</h1>
      <p className="mb-6 text-sm text-ink-faint">
        Manual payouts. Money is not moved by the system: a second staff member approves a batch, then finance records the
        bank transfer reference by hand. Minimum payout {formatMoney(min, 'INR')}.
      </p>

      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-faint">Payable now</h2>
      <div className="mb-4 overflow-x-auto rounded-xl border border-surface-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-black/20 text-xs uppercase tracking-wide text-ink-faint">
            <tr>
              <th className="px-4 py-3"></th>
              <th className="px-4 py-3">Partner</th>
              <th className="px-4 py-3">Commissions</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Payout details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {groups.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-ink-faint">
                  Nothing payable yet.
                </td>
              </tr>
            )}
            {groups.map((g) => (
              <tr key={g.partnerId} className={g.meetsMinimum ? '' : 'opacity-50'}>
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    disabled={!g.meetsMinimum}
                    checked={!!selected[g.partnerId]}
                    onChange={(e) => setSelected((s) => ({ ...s, [g.partnerId]: e.target.checked }))}
                  />
                </td>
                <td className="px-4 py-3 text-ink">{g.displayName}</td>
                <td className="px-4 py-3 text-ink-faint">{g.commissionIds.length}</td>
                <td className="px-4 py-3 font-semibold text-ink">{formatMoney(g.grossMinor, g.currency as 'INR' | 'USD')}</td>
                <td className="px-4 py-3 text-xs">
                  {g.hasPayoutDetails ? (
                    <span className="text-emerald-600 dark:text-emerald-400">On file</span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">Missing</span>
                  )}
                  {!g.meetsMinimum && <span className="ml-2 text-ink-faint">below minimum</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mb-10 flex items-center gap-2">
        <input
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          placeholder="YYYY-MM"
          className="rounded border border-surface-border bg-surface px-2 py-1 text-sm"
        />
        <button
          type="button"
          disabled={create.isPending || groups.filter((g) => g.meetsMinimum).length === 0}
          onClick={() => create.mutate()}
          className="rounded bg-[#155EEF] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          Create batch{Object.values(selected).some(Boolean) ? ' (selected)' : ' (all eligible)'}
        </button>
      </div>

      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-faint">Batches</h2>
      <div className="space-y-3">
        {(batches.data?.batches ?? []).length === 0 && <p className="text-sm text-ink-faint">No batches yet.</p>}
        {(batches.data?.batches ?? []).map((b) => (
          <div key={b.id} className="rounded-xl border border-surface-border">
            <button
              type="button"
              onClick={() => setOpenBatch((cur) => (cur === b.id ? null : b.id))}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm"
            >
              <span>
                <span className="font-semibold text-ink">{b.periodLabel}</span>
                <span className="ml-3 text-ink-faint">
                  {b.commissionCount} commissions · {formatMoney(b.grossMinor, b.currency as 'INR' | 'USD')}
                </span>
              </span>
              <span className="rounded-full bg-black/20 px-2 py-0.5 text-xs">{b.status}</span>
            </button>

            {openBatch === b.id && (
              <div className="border-t border-surface-border px-4 py-3">
                <table className="mb-3 w-full text-left text-xs">
                  <thead className="text-ink-faint">
                    <tr>
                      <th className="py-1">Partner</th>
                      <th className="py-1">Amount</th>
                      <th className="py-1">Method</th>
                      <th className="py-1">To</th>
                      <th className="py-1">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(batchDetail.data?.payouts ?? []).map((p) => (
                      <tr key={p.id} className="border-t border-surface-border/50">
                        <td className="py-1.5 text-ink">{p.partnerName}</td>
                        <td className="py-1.5 font-semibold text-ink">{formatMoney(p.netMinor, p.currency as 'INR' | 'USD')}</td>
                        <td className="py-1.5 text-ink-faint">{p.payoutMethod ?? '-'}</td>
                        <td className="py-1.5 text-ink-faint">{p.payoutTo ?? 'no details on file'}</td>
                        <td className="py-1.5 text-ink-faint">{p.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {b.status === 'DRAFT' && (
                  <div className="flex gap-2">
                    <button type="button" disabled={act.isPending} onClick={() => act.mutate({ kind: 'approve', batchId: b.id })} className="rounded bg-[#0B7A48] px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">
                      Approve (as a different staff member)
                    </button>
                    <button type="button" disabled={act.isPending} onClick={() => act.mutate({ kind: 'cancel', batchId: b.id })} className="rounded border border-[#B32D1A] px-3 py-1 text-xs font-semibold text-[#B32D1A] disabled:opacity-50">
                      Cancel
                    </button>
                  </div>
                )}
                {b.status === 'APPROVED' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Bank UTR / transfer reference" className="rounded border border-surface-border bg-surface px-2 py-1 text-xs" />
                    <button type="button" disabled={act.isPending || !ref.trim()} onClick={() => act.mutate({ kind: 'paid', batchId: b.id })} className="rounded bg-[#155EEF] px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">
                      Mark paid
                    </button>
                    <button type="button" disabled={act.isPending} onClick={() => act.mutate({ kind: 'cancel', batchId: b.id })} className="rounded border border-[#B32D1A] px-3 py-1 text-xs font-semibold text-[#B32D1A] disabled:opacity-50">
                      Cancel
                    </button>
                  </div>
                )}
                {b.status === 'PAID' && b.externalReference && (
                  <p className="text-xs text-ink-faint">Paid. Reference: {b.externalReference}</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
