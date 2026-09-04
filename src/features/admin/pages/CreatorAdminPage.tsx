import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { creatorAdminApi } from '@/features/creator/api/creatorApi';
import type { CreatorRole } from '@/features/creator/lib/creatorRole';
import { useUiStore } from '@/store/useUiStore';
import { errorText } from '@/lib/errorMessages';
import { formatMoney } from '@/utils/currency';

const ROLE_LABEL: Record<string, string> = {
  course_creator: 'Course Creator',
  practice_test_creator: 'Practice-Test Creator',
  mock_test_creator: 'Mock-Test Creator',
  reviewer: 'Reviewer / SME',
};
const field = 'rounded border border-surface-border bg-surface px-2 py-1 text-sm';

export function CreatorAdminPage() {
  const pushToast = useUiStore((s) => s.pushToast);
  const qc = useQueryClient();

  const apps = useQuery({ queryKey: ['admin', 'creatorApps'], queryFn: () => creatorAdminApi.listApplications() });
  const contracts = useQuery({ queryKey: ['admin', 'creatorContracts'], queryFn: () => creatorAdminApi.listContracts() });
  const assignments = useQuery({ queryKey: ['admin', 'creatorAssignments'], queryFn: () => creatorAdminApi.listAssignments() });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'creatorApps'] });
    qc.invalidateQueries({ queryKey: ['admin', 'creatorContracts'] });
    qc.invalidateQueries({ queryKey: ['admin', 'creatorAssignments'] });
  };

  const review = useMutation({
    mutationFn: (v: { roleDocId: string; decision: 'approve' | 'reject' | 'suspend' | 'reinstate'; note?: string }) =>
      creatorAdminApi.reviewRole(v),
    onSuccess: () => {
      pushToast('Updated', 'success');
      invalidate();
    },
    onError: (e) => pushToast(errorText(e, 'Could not update the role'), 'error'),
  });

  // --- contract form ---
  const [cPartnerId, setCPartnerId] = useState('');
  const [cRole, setCRole] = useState<CreatorRole>('practice_test_creator');
  const [cModel, setCModel] = useState<'FIXED' | 'PER_ITEM' | 'REVIEW'>('PER_ITEM');
  const [cRate, setCRate] = useState('');
  const [cScopeType, setCScopeType] = useState<'certification' | 'domain' | 'series'>('certification');
  const [cScopeRef, setCScopeRef] = useState('');
  const [cDeliverables, setCDeliverables] = useState('');
  const [cAcceptance, setCAcceptance] = useState('');

  const saveContract = useMutation({
    mutationFn: () =>
      creatorAdminApi.saveContract({
        partnerId: cPartnerId.trim(),
        role: cRole,
        scopeType: cScopeType,
        scopeRef: cScopeRef.trim() || undefined,
        compensationModel: cModel,
        rateMinor: Math.round(parseFloat(cRate) * 100),
        deliverables: cDeliverables.trim(),
        acceptanceCriteria: cAcceptance.trim(),
      }),
    onSuccess: () => {
      pushToast('Contract saved', 'success');
      setCRate('');
      setCDeliverables('');
      setCAcceptance('');
      invalidate();
    },
    onError: (e) => pushToast(errorText(e, 'Could not save the contract'), 'error'),
  });

  // --- assignment form ---
  const [aContractId, setAContractId] = useState('');
  const [aTitle, setATitle] = useState('');
  const [aTarget, setATarget] = useState<'quiz' | 'practiceTest' | 'questionBank' | 'mockTest'>('questionBank');

  const createAssignment = useMutation({
    mutationFn: () => creatorAdminApi.createAssignment({ contractId: aContractId.trim(), title: aTitle.trim(), targetType: aTarget }),
    onSuccess: () => {
      pushToast('Assignment created', 'success');
      setATitle('');
      invalidate();
    },
    onError: (e) => pushToast(errorText(e, 'Could not create the assignment'), 'error'),
  });

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-ink">Creators</h1>

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-faint">Role applications</h2>
        <div className="overflow-x-auto rounded-xl border border-surface-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/20 text-xs uppercase tracking-wide text-ink-faint">
              <tr>
                <th className="px-4 py-3">Partner</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Expertise</th>
                <th className="px-4 py-3">Sample</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {(apps.data?.applications ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-ink-faint">
                    No applications yet.
                  </td>
                </tr>
              )}
              {(apps.data?.applications ?? []).map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-3 text-ink">
                    {a.partnerName}
                    <span className="block font-mono text-xs text-ink-faint">{a.partnerId}</span>
                  </td>
                  <td className="px-4 py-3 text-ink-faint">{ROLE_LABEL[a.role] ?? a.role}</td>
                  <td className="px-4 py-3 text-xs text-ink-faint">{a.subjectExpertise.join(', ') || '-'}</td>
                  <td className="px-4 py-3 text-xs">
                    {a.sampleUrl ? (
                      <a href={a.sampleUrl} target="_blank" rel="noreferrer" className="text-[#155EEF] hover:underline">
                        link
                      </a>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-black/20 px-2 py-0.5 text-xs">{a.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {(a.status === 'APPLIED' || a.status === 'UNDER_REVIEW') && (
                        <>
                          <button type="button" disabled={review.isPending} onClick={() => review.mutate({ roleDocId: a.id, decision: 'approve' })} className="rounded bg-[#0B7A48] px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">
                            Approve
                          </button>
                          <button type="button" disabled={review.isPending} onClick={() => review.mutate({ roleDocId: a.id, decision: 'reject', note: window.prompt('Reason?') || undefined })} className="rounded border border-[#B32D1A] px-3 py-1 text-xs font-semibold text-[#B32D1A] disabled:opacity-50">
                            Reject
                          </button>
                        </>
                      )}
                      {a.status === 'APPROVED' && (
                        <button type="button" disabled={review.isPending} onClick={() => review.mutate({ roleDocId: a.id, decision: 'suspend', note: window.prompt('Reason?') || undefined })} className="rounded border border-surface-border px-3 py-1 text-xs text-ink-muted disabled:opacity-50">
                          Suspend
                        </button>
                      )}
                      {a.status === 'SUSPENDED' && (
                        <button type="button" disabled={review.isPending} onClick={() => review.mutate({ roleDocId: a.id, decision: 'reinstate' })} className="rounded border border-surface-border px-3 py-1 text-xs text-ink-muted disabled:opacity-50">
                          Reinstate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-surface-border bg-surface-raised p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-faint">New / update contract</h2>
          <input className={`${field} w-full`} value={cPartnerId} onChange={(e) => setCPartnerId(e.target.value)} placeholder="Partner ID (must hold the approved role)" />
          <div className="flex gap-2">
            <select className={`${field} flex-1`} value={cRole} onChange={(e) => setCRole(e.target.value as CreatorRole)}>
              {Object.entries(ROLE_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <select className={field} value={cModel} onChange={(e) => setCModel(e.target.value as typeof cModel)}>
              <option value="FIXED">Fixed fee</option>
              <option value="PER_ITEM">Per item</option>
              <option value="REVIEW">Review fee</option>
            </select>
          </div>
          <input className={`${field} w-full`} inputMode="decimal" value={cRate} onChange={(e) => setCRate(e.target.value)} placeholder={cModel === 'FIXED' ? 'Fixed fee in ₹' : 'Rate per item in ₹'} />
          <div className="flex gap-2">
            <select className={field} value={cScopeType} onChange={(e) => setCScopeType(e.target.value as typeof cScopeType)}>
              <option value="certification">Certification</option>
              <option value="domain">Domain</option>
              <option value="series">Series</option>
            </select>
            <input className={`${field} flex-1`} value={cScopeRef} onChange={(e) => setCScopeRef(e.target.value)} placeholder="Scope ref (optional)" />
          </div>
          <textarea className={`${field} w-full`} rows={2} value={cDeliverables} onChange={(e) => setCDeliverables(e.target.value)} placeholder="Deliverables" />
          <textarea className={`${field} w-full`} rows={2} value={cAcceptance} onChange={(e) => setCAcceptance(e.target.value)} placeholder="Acceptance criteria" />
          <button
            type="button"
            disabled={saveContract.isPending || !cPartnerId.trim() || !cRate || !cDeliverables.trim() || !cAcceptance.trim()}
            onClick={() => saveContract.mutate()}
            className="rounded bg-[#155EEF] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Save contract
          </button>
        </div>

        <div className="space-y-3">
          <div className="space-y-2 rounded-xl border border-surface-border bg-surface-raised p-5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-ink-faint">New assignment</h2>
            <select className={`${field} w-full`} value={aContractId} onChange={(e) => setAContractId(e.target.value)}>
              <option value="">Select a contract…</option>
              {(contracts.data?.contracts ?? []).map((c) => (
                <option key={String(c.id)} value={String(c.id)}>
                  {String(c.partnerId)} · {String(c.compensationModel)} · {formatMoney(Number(c.rateMinor) || 0, 'INR')}
                </option>
              ))}
            </select>
            <input className={`${field} w-full`} value={aTitle} onChange={(e) => setATitle(e.target.value)} placeholder="Assignment title" />
            <select className={`${field} w-full`} value={aTarget} onChange={(e) => setATarget(e.target.value as typeof aTarget)}>
              <option value="questionBank">Question bank</option>
              <option value="quiz">Quiz</option>
              <option value="practiceTest">Practice test</option>
              <option value="mockTest">Mock test</option>
            </select>
            <button
              type="button"
              disabled={createAssignment.isPending || !aContractId || aTitle.trim().length < 3}
              onClick={() => createAssignment.mutate()}
              className="rounded bg-[#155EEF] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Create assignment
            </button>
          </div>

          <div className="rounded-xl border border-surface-border bg-surface-raised p-5">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-faint">Assignments</h2>
            {(assignments.data?.assignments ?? []).length === 0 ? (
              <p className="text-sm text-ink-faint">None yet.</p>
            ) : (
              <ul className="space-y-1 text-xs text-ink-faint">
                {(assignments.data?.assignments ?? []).map((a) => (
                  <li key={String(a.id)}>
                    <span className="text-ink">{String(a.title)}</span> · {String(a.partnerId)} · {String(a.status)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
