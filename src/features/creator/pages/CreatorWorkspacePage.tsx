import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { creatorApi } from '../api/creatorApi';
import { CREATOR_ROLES, type CreatorRole } from '../lib/creatorRole';
import { useUiStore } from '@/store/useUiStore';
import { errorText } from '@/lib/errorMessages';

const ROLE_LABEL: Record<string, string> = {
  course_creator: 'Course Creator',
  practice_test_creator: 'Practice-Test Creator',
  mock_test_creator: 'Mock-Test Creator',
  reviewer: 'Reviewer / SME',
};

const field = 'w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm';

export function CreatorWorkspacePage() {
  const pushToast = useUiStore((s) => s.pushToast);
  const qc = useQueryClient();

  const roles = useQuery({ queryKey: ['creator', 'myRoles'], queryFn: creatorApi.getMyRoles });
  const assignments = useQuery({ queryKey: ['creator', 'myAssignments'], queryFn: creatorApi.listMyAssignments });

  const [role, setRole] = useState<CreatorRole>('practice_test_creator');
  const [expertise, setExpertise] = useState('');
  const [qualifications, setQualifications] = useState('');
  const [sampleUrl, setSampleUrl] = useState('');
  const [accept, setAccept] = useState(false);

  const apply = useMutation({
    mutationFn: () =>
      creatorApi.applyRole({
        role,
        subjectExpertise: expertise.split(',').map((s) => s.trim()).filter(Boolean),
        qualifications: qualifications.trim() || undefined,
        sampleUrl: sampleUrl.trim() || undefined,
        acceptCreatorAgreement: true,
      }),
    onSuccess: () => {
      pushToast('Role application submitted', 'success');
      setExpertise('');
      setQualifications('');
      setSampleUrl('');
      setAccept(false);
      qc.invalidateQueries({ queryKey: ['creator', 'myRoles'] });
    },
    onError: (e) => pushToast(errorText(e, 'Could not submit your application'), 'error'),
  });

  const held = new Set((roles.data?.roles ?? []).filter((r) => r.status !== 'REJECTED').map((r) => r.role));
  const applicable = CREATOR_ROLES.filter((r) => !held.has(r));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold text-ink">Creator workspace</h1>
      <p className="text-sm text-ink-faint">
        Apply for a creator role to contribute courses, practice questions or mock tests. Creator earnings are separate
        from any sales commission on your account.
      </p>

      <section className="rounded-xl border border-surface-border bg-surface-raised p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-faint">My roles</h2>
        {roles.isLoading ? (
          <p className="text-sm text-ink-faint">Loading…</p>
        ) : (roles.data?.roles ?? []).length === 0 ? (
          <p className="text-sm text-ink-faint">You haven't applied for any creator role yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {(roles.data?.roles ?? []).map((r) => (
              <li key={r.role} className="flex items-center justify-between">
                <span className="text-ink">{ROLE_LABEL[r.role] ?? r.role}</span>
                <span className="rounded-full bg-black/20 px-2 py-0.5 text-xs">{r.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {applicable.length > 0 && (
        <section className="space-y-3 rounded-xl border border-surface-border bg-surface-raised p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-faint">Apply for a role</h2>
          <select className={field} value={role} onChange={(e) => setRole(e.target.value as CreatorRole)}>
            {applicable.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <input className={field} value={expertise} onChange={(e) => setExpertise(e.target.value)} placeholder="Subject expertise (comma-separated, e.g. CISM, CISA)" />
          <textarea className={field} rows={3} value={qualifications} onChange={(e) => setQualifications(e.target.value)} placeholder="Qualifications / relevant experience" />
          <input className={field} value={sampleUrl} onChange={(e) => setSampleUrl(e.target.value)} placeholder="Link to a work sample (optional)" />
          <label className="flex items-start gap-2 text-sm text-ink">
            <input type="checkbox" className="mt-1" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
            <span>
              I accept the{' '}
              <Link to="/terms" className="text-[#155EEF] hover:underline">
                creator agreement
              </Link>{' '}
              including its originality, accuracy and no-leaked-exam-content terms.
            </span>
          </label>
          <button
            type="button"
            disabled={!accept || expertise.trim().length < 2 || apply.isPending}
            onClick={() => apply.mutate()}
            className="rounded-lg bg-[#155EEF] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {apply.isPending ? 'Submitting…' : 'Submit application'}
          </button>
        </section>
      )}

      <section className="rounded-xl border border-surface-border bg-surface-raised p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-faint">My assignments</h2>
        {(assignments.data?.assignments ?? []).length === 0 ? (
          <p className="text-sm text-ink-faint">No assignments yet. An admin creates these once a role is approved.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-surface-border/60">
              {(assignments.data?.assignments ?? []).map((a) => (
                <tr key={a.id}>
                  <td className="py-2 text-ink">{a.title}</td>
                  <td className="py-2 text-ink-faint">{a.targetType}</td>
                  <td className="py-2 text-ink-faint">{a.dueAt ? new Date(a.dueAt).toLocaleDateString() : '-'}</td>
                  <td className="py-2">
                    <span className="rounded-full bg-black/20 px-2 py-0.5 text-xs">{a.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <p className="text-xs text-ink-faint">Content submission, review and earnings arrive in the next release.</p>
    </div>
  );
}
