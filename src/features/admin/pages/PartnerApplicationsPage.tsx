import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { partnerAdminApi } from '@/features/partner/api/partnerApi';
import { useUiStore } from '@/store/useUiStore';
import { errorText } from '@/lib/errorMessages';
import { toDate } from '@/utils/formatDate';

function fmt(ts: unknown): string {
  return ts ? toDate(ts).toLocaleDateString() : '-';
}

export function PartnerApplicationsPage() {
  const pushToast = useUiStore((s) => s.pushToast);
  const queryClient = useQueryClient();

  const flags = useQuery({ queryKey: ['admin', 'partnerFlags'], queryFn: partnerAdminApi.getFrameworkSettings });
  const apps = useQuery({ queryKey: ['admin', 'partnerApplications'], queryFn: () => partnerAdminApi.listApplications() });
  const partners = useQuery({ queryKey: ['admin', 'partners'], queryFn: partnerAdminApi.listPartners });

  const [reviewFor, setReviewFor] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const saveFlags = useMutation({
    mutationFn: partnerAdminApi.saveFrameworkFlags,
    onSuccess: () => {
      pushToast('Saved', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'partnerFlags'] });
    },
    onError: (err) => pushToast(errorText(err, 'Could not save'), 'error'),
  });

  const review = useMutation({
    mutationFn: (v: { applicationId: string; decision: 'approve' | 'reject'; note?: string }) =>
      partnerAdminApi.reviewApplication(v),
    onSuccess: (r) => {
      pushToast(r.status === 'APPROVED' ? `Approved · code ${r.referralCode}` : 'Application rejected', 'success');
      setReviewFor(null);
      setNote('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'partnerApplications'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'partners'] });
    },
    onError: (err) => pushToast(errorText(err, 'Could not review the application'), 'error'),
  });

  const setPartner = useMutation({
    mutationFn: (v: { partnerId: string; suspend: boolean }) =>
      v.suspend ? partnerAdminApi.suspendPartner({ partnerId: v.partnerId }) : partnerAdminApi.reactivatePartner({ partnerId: v.partnerId }),
    onSuccess: () => {
      pushToast('Updated', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'partners'] });
    },
    onError: (err) => pushToast(errorText(err, 'Could not update the partner'), 'error'),
  });

  const f = flags.data ?? { enabled: false, applicationsOpen: false };

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-ink">Partners</h1>
      <p className="mb-6 text-sm text-ink-faint">Partner applications, approvals and status.</p>

      <div className="mb-8 flex flex-wrap gap-6 rounded-xl border border-surface-border bg-surface-raised px-5 py-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={f.enabled}
            onChange={(e) => saveFlags.mutate({ enabled: e.target.checked, applicationsOpen: f.applicationsOpen })}
          />
          Partner framework enabled
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={f.applicationsOpen}
            onChange={(e) => saveFlags.mutate({ enabled: f.enabled, applicationsOpen: e.target.checked })}
          />
          Accepting new applications
        </label>
      </div>

      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-faint">Applications</h2>
      <div className="mb-10 overflow-x-auto rounded-xl border border-surface-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-black/20 text-xs uppercase tracking-wide text-ink-faint">
            <tr>
              <th className="px-4 py-3">Applicant</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">DOB</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Submitted</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {(apps.data?.applications ?? []).length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-ink-faint" colSpan={7}>
                  No applications yet.
                </td>
              </tr>
            )}
            {(apps.data?.applications ?? []).map((a) => (
              <tr key={a.id}>
                <td className="px-4 py-3 text-ink">
                  {a.legalName}
                  <span className="block text-xs text-ink-faint">as {a.displayName}</span>
                </td>
                <td className="px-4 py-3 capitalize text-ink-faint">{a.partnerType}</td>
                <td className="px-4 py-3 text-ink-faint">{a.dateOfBirth}</td>
                <td className="px-4 py-3 text-ink-faint">{a.phone}</td>
                <td className="px-4 py-3 text-ink-faint">{fmt(a.submittedAt)}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-black/20 px-2 py-0.5 text-xs">{a.status}</span>
                </td>
                <td className="px-4 py-3">
                  {(a.status === 'SUBMITTED' || a.status === 'UNDER_REVIEW') &&
                    (reviewFor === a.id ? (
                      <div className="flex flex-col gap-2">
                        <input
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Note (optional / required for reject)"
                          className="rounded border border-surface-border bg-surface px-2 py-1 text-xs"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={review.isPending}
                            onClick={() => review.mutate({ applicationId: a.id, decision: 'approve', note: note || undefined })}
                            className="rounded bg-[#0B7A48] px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={review.isPending || !note.trim()}
                            onClick={() => review.mutate({ applicationId: a.id, decision: 'reject', note })}
                            className="rounded border border-[#B32D1A] px-3 py-1 text-xs font-semibold text-[#B32D1A] disabled:opacity-50"
                          >
                            Reject
                          </button>
                          <button type="button" onClick={() => { setReviewFor(null); setNote(''); }} className="px-2 py-1 text-xs text-ink-faint">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setReviewFor(a.id)} className="rounded bg-[#155EEF] px-3 py-1 text-xs font-semibold text-white">
                        Review
                      </button>
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-faint">Approved partners</h2>
      <div className="overflow-x-auto rounded-xl border border-surface-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-black/20 text-xs uppercase tracking-wide text-ink-faint">
            <tr>
              <th className="px-4 py-3">Partner ID</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Since</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {(partners.data?.partners ?? []).length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-ink-faint" colSpan={6}>
                  No partners yet.
                </td>
              </tr>
            )}
            {(partners.data?.partners ?? []).map((p) => (
              <tr key={p.partnerId}>
                <td className="px-4 py-3 font-mono text-xs text-ink">{p.partnerId}</td>
                <td className="px-4 py-3 text-ink">{p.displayName}</td>
                <td className="px-4 py-3 capitalize text-ink-faint">{p.partnerType}</td>
                <td className="px-4 py-3 text-ink-faint">{fmt(p.createdAt)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      p.status === 'ACTIVE' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-red-500/15 text-red-500'
                    }`}
                  >
                    {p.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    disabled={setPartner.isPending}
                    onClick={() => setPartner.mutate({ partnerId: p.partnerId, suspend: p.status === 'ACTIVE' })}
                    className="rounded border border-surface-border px-3 py-1 text-xs text-ink-muted disabled:opacity-50"
                  >
                    {p.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
