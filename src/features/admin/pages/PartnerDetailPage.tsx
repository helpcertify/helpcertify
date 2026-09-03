import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { partnerAdminApi } from '@/features/partner/api/partnerApi';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { useUiStore } from '@/store/useUiStore';
import { errorText } from '@/lib/errorMessages';
import { formatMoney } from '@/utils/currency';
import { toDate } from '@/utils/formatDate';

function fmt(ts: unknown): string {
  return ts ? toDate(ts).toLocaleString() : '-';
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-surface-border/60 py-2 text-sm last:border-0">
      <span className="text-ink-faint">{label}</span>
      <span className="text-right text-ink">{value ?? '-'}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-raised p-5">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-faint">{title}</h2>
      {children}
    </div>
  );
}

export function PartnerDetailPage() {
  const { partnerId = '' } = useParams();
  const pushToast = useUiStore((s) => s.pushToast);
  const qc = useQueryClient();
  const canRevealPan = useAuthStore((s) => s.profile?.canRevealPan === true);
  const [revealed, setRevealed] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'partnerDetail', partnerId],
    queryFn: () => partnerAdminApi.getPartnerDetail({ partnerId }),
    enabled: !!partnerId,
  });

  const setStatus = useMutation({
    mutationFn: (payoutStatus: 'OK' | 'KYC_ACTION_REQUIRED' | 'PAYOUT_BLOCKED') =>
      partnerAdminApi.setPartnerPayoutStatus({ partnerId, payoutStatus }),
    onSuccess: () => {
      pushToast('Payout status updated', 'success');
      qc.invalidateQueries({ queryKey: ['admin', 'partnerDetail', partnerId] });
    },
    onError: (e) => pushToast(errorText(e, 'Could not update'), 'error'),
  });

  const reveal = async () => {
    const reason = window.prompt('Reason for revealing this PAN (recorded in the audit log):');
    if (!reason || reason.trim().length < 5) return;
    try {
      const res = await partnerAdminApi.revealPartnerPan({ partnerId, reason: reason.trim() });
      setRevealed(res.pan);
    } catch (e) {
      pushToast(errorText(e, 'Could not reveal PAN'), 'error');
    }
  };

  if (isLoading) return <p className="text-sm text-ink-faint">Loading…</p>;
  if (error || !data) return <p className="text-sm text-[#B32D1A]">{errorText(error, 'Could not load this partner')}</p>;

  const d = data;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link to="/admin/partners" className="text-sm text-[#155EEF] hover:underline">
        ← Partners
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">{d.header.displayName}</h1>
          <p className="text-sm text-ink-faint">
            {d.header.legalName} · <span className="font-mono text-xs">{d.partnerId}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-black/20 px-2 py-0.5 text-xs font-semibold">{d.header.status}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              d.header.payoutStatus === 'OK'
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                : d.header.payoutStatus === 'PAYOUT_BLOCKED'
                  ? 'bg-red-500/15 text-red-500'
                  : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
            }`}
          >
            {d.header.payoutStatus}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {d.header.payoutStatus !== 'OK' && (
          <button type="button" disabled={setStatus.isPending} onClick={() => setStatus.mutate('OK')} className="rounded bg-[#0B7A48] px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">
            Clear KYC (payouts OK)
          </button>
        )}
        {d.header.payoutStatus !== 'PAYOUT_BLOCKED' && (
          <button type="button" disabled={setStatus.isPending} onClick={() => setStatus.mutate('PAYOUT_BLOCKED')} className="rounded border border-[#B32D1A] px-3 py-1 text-xs font-semibold text-[#B32D1A] disabled:opacity-50">
            Block payouts
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Section title="Contact">
          <Row label="Email" value={d.contact.email} />
          <Row label="Email verified" value={d.contact.emailVerified ? 'Yes' : 'No'} />
          <Row label="Phone" value={d.contact.phone} />
          <Row label="Date of birth" value={d.contact.dateOfBirth} />
          <Row label="Address" value={d.contact.address} />
        </Section>

        <Section title="Tax & identity">
          <Row
            label="PAN"
            value={
              <span className="font-mono">
                {revealed ?? d.tax.panMasked ?? '-'}
                {canRevealPan && d.tax.panMasked && !revealed && (
                  <button type="button" onClick={reveal} className="ml-2 text-[10px] text-[#155EEF] hover:underline">
                    reveal
                  </button>
                )}
              </span>
            }
          />
          <Row label="PAN status" value={d.tax.panStatus} />
          <Row label="Name on PAN" value={d.tax.panName} />
          <Row label="GSTIN" value={d.tax.gstinMasked} />
          <Row label="Country" value={d.tax.country} />
          {d.tax.duplicatePanFlag && (
            <Row label="Flag" value={<span className="text-amber-600 dark:text-amber-400">Duplicate PAN - review</span>} />
          )}
        </Section>

        <Section title="Payout details">
          {d.payout ? (
            <>
              <Row label="Method" value={d.payout.method} />
              <Row label="Account name" value={d.payout.accountName} />
              {d.payout.method === 'UPI' ? (
                <Row label="UPI" value={d.payout.upiVpa} />
              ) : (
                <>
                  <Row label="Account" value={d.payout.bankAccountLast4} />
                  <Row label="IFSC" value={d.payout.bankIfsc} />
                </>
              )}
            </>
          ) : (
            <p className="text-sm text-ink-faint">Partner has not added payout details.</p>
          )}
        </Section>

        <Section title="Performance">
          <Row label="Referral visits" value={d.performance.referralEventCount} />
          <Row label="Commissions" value={d.performance.commissionCount} />
          <Row label="Pending" value={formatMoney(d.performance.pendingMinor, 'INR')} />
          <Row label="Payable" value={formatMoney(d.performance.payableMinor, 'INR')} />
          <Row label="Paid" value={formatMoney(d.performance.paidMinor, 'INR')} />
          <Row label="Reversed" value={formatMoney(d.performance.reversedMinor, 'INR')} />
        </Section>

        <Section title="Referral codes">
          {d.codes.length === 0 && <p className="text-sm text-ink-faint">None.</p>}
          {d.codes.map((c) => (
            <Row key={c.code} label={<span className="font-mono">{c.code}</span>} value={c.active ? 'active' : 'disabled'} />
          ))}
        </Section>

        <Section title="Agreements">
          {d.agreements.length === 0 && <p className="text-sm text-ink-faint">None recorded.</p>}
          {d.agreements.map((a, i) => (
            <Row key={i} label={a.version} value={fmt(a.acceptedAt)} />
          ))}
        </Section>
      </div>

      <Section title="Payout history">
        {d.payouts.length === 0 ? (
          <p className="text-sm text-ink-faint">No payouts yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-surface-border/60">
              {d.payouts.map((p) => (
                <tr key={p.id}>
                  <td className="py-2 text-ink">{p.periodLabel}</td>
                  <td className="py-2 font-semibold text-ink">{formatMoney(p.netMinor, p.currency as 'INR' | 'USD')}</td>
                  <td className="py-2 text-ink-faint">{p.status}</td>
                  <td className="py-2 text-xs text-ink-faint">{p.externalReference ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Activity & audit">
        {d.audit.length === 0 ? (
          <p className="text-sm text-ink-faint">No activity recorded.</p>
        ) : (
          <ul className="space-y-1 text-xs text-ink-faint">
            {d.audit.map((a, i) => (
              <li key={i}>
                <span className="text-ink">{a.action}</span> · {fmt(a.createdAt)} · {a.actorId}
                {a.reason ? ` · ${a.reason}` : ''}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
