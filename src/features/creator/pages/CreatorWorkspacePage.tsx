import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { creatorApi } from '../api/creatorApi';
import { CREATOR_ROLES, type CreatorRole } from '../lib/creatorRole';
import { parseQaText } from '../lib/parseQa';
import { useUiStore } from '@/store/useUiStore';
import { errorText } from '@/lib/errorMessages';
import { formatMoney } from '@/utils/currency';
import { CatalogSubmissionForm } from '@/features/catalogSubmissions/components/CatalogSubmissionForm';

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
  const submissions = useQuery({ queryKey: ['creator', 'mySubmissions'], queryFn: creatorApi.listMySubmissions });
  const earnings = useQuery({ queryKey: ['creator', 'myEarnings'], queryFn: creatorApi.listMyEarnings });

  // --- Content Studio ---
  const [studioAssignment, setStudioAssignment] = useState('');
  const [studioTitle, setStudioTitle] = useState('');
  const [studioText, setStudioText] = useState('');
  const [declOriginality, setDeclOriginality] = useState(false);
  const [declNoLeaked, setDeclNoLeaked] = useState(false);
  const [declAi, setDeclAi] = useState(false);
  const [declAiVerifier, setDeclAiVerifier] = useState('');
  const [draftId, setDraftId] = useState<string | null>(null);

  const parsed = useMemo(() => parseQaText(studioText), [studioText]);

  const saveDraft = useMutation({
    mutationFn: () =>
      creatorApi.saveSubmission({
        submissionId: draftId ?? undefined,
        assignmentId: studioAssignment,
        title: studioTitle.trim(),
        items: parsed.items,
        declarations: {
          originality: declOriginality,
          aiAssisted: declAi,
          aiVerifiedBy: declAiVerifier.trim() || undefined,
          noLeakedExam: declNoLeaked,
        },
      }),
    onSuccess: (r) => {
      setDraftId(r.submissionId);
      pushToast('Draft saved', 'success');
      qc.invalidateQueries({ queryKey: ['creator', 'mySubmissions'] });
    },
    onError: (e) => pushToast(errorText(e, 'Could not save the draft'), 'error'),
  });

  const submitForReview = useMutation({
    mutationFn: async () => {
      const r = await creatorApi.saveSubmission({
        submissionId: draftId ?? undefined,
        assignmentId: studioAssignment,
        title: studioTitle.trim(),
        items: parsed.items,
        declarations: {
          originality: declOriginality,
          aiAssisted: declAi,
          aiVerifiedBy: declAiVerifier.trim() || undefined,
          noLeakedExam: declNoLeaked,
        },
      });
      return creatorApi.submitSubmission({ submissionId: r.submissionId });
    },
    onSuccess: (r) => {
      pushToast(
        r.status === 'SME_REVIEW'
          ? 'Submitted for review'
          : `Flagged by automated checks (${r.duplicateHits} duplicate, ${r.leakedPhraseHits} phrase)`,
        r.status === 'SME_REVIEW' ? 'success' : 'error',
      );
      setDraftId(null);
      setStudioText('');
      setStudioTitle('');
      qc.invalidateQueries({ queryKey: ['creator', 'mySubmissions'] });
    },
    onError: (e) => pushToast(errorText(e, 'Could not submit'), 'error'),
  });

  const withdraw = useMutation({
    mutationFn: (submissionId: string) => creatorApi.withdrawSubmission({ submissionId }),
    onSuccess: () => {
      pushToast('Withdrawn', 'success');
      qc.invalidateQueries({ queryKey: ['creator', 'mySubmissions'] });
    },
    onError: (e) => pushToast(errorText(e, 'Could not withdraw'), 'error'),
  });

  const canSubmit =
    !!studioAssignment &&
    studioTitle.trim().length >= 3 &&
    parsed.items.length > 0 &&
    parsed.errors.length === 0 &&
    declOriginality &&
    declNoLeaked &&
    (!declAi || declAiVerifier.trim().length > 0);

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

      <section className="space-y-3 rounded-xl border border-surface-border bg-surface-raised p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink-faint">Content Studio</h2>
        <select className={field} value={studioAssignment} onChange={(e) => setStudioAssignment(e.target.value)}>
          <option value="">Select an assignment…</option>
          {(assignments.data?.assignments ?? [])
            .filter((a) => a.status === 'ASSIGNED' || a.status === 'IN_PROGRESS')
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
        </select>
        <input className={field} value={studioTitle} onChange={(e) => setStudioTitle(e.target.value)} placeholder="Submission title" />
        <textarea
          className={`${field} font-mono`}
          rows={10}
          value={studioText}
          onChange={(e) => setStudioText(e.target.value)}
          placeholder={`Paste questions, e.g.\n\n1. What is the CIA triad?\nA. Confidentiality, Integrity, Availability\nB. ...\nAnswer: A\nExplanation: ...`}
        />
        <p className="text-xs text-ink-faint">
          Parsed {parsed.items.length} item(s).
          {parsed.errors.length > 0 && (
            <span className="text-[#B32D1A]"> {parsed.errors.length} block(s) need fixing: {parsed.errors.map((e) => `#${e.block} ${e.message}`).join('; ')}</span>
          )}
        </p>
        <div className="space-y-1.5 text-xs text-ink">
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-0.5" checked={declOriginality} onChange={(e) => setDeclOriginality(e.target.checked)} />
            This content is my original work (or properly licensed).
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-0.5" checked={declNoLeaked} onChange={(e) => setDeclNoLeaked(e.target.checked)} />
            None of it is copied or memorised from a live certification exam.
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-0.5" checked={declAi} onChange={(e) => setDeclAi(e.target.checked)} />
            Some of it was AI-assisted.
          </label>
          {declAi && (
            <input className={field} value={declAiVerifier} onChange={(e) => setDeclAiVerifier(e.target.value)} placeholder="Who verified the AI-assisted content?" />
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={saveDraft.isPending || !studioAssignment || studioTitle.trim().length < 3}
            onClick={() => saveDraft.mutate()}
            className="rounded border border-surface-border px-4 py-1.5 text-sm text-ink-muted disabled:opacity-50"
          >
            Save draft
          </button>
          <button
            type="button"
            disabled={!canSubmit || submitForReview.isPending}
            onClick={() => submitForReview.mutate()}
            className="rounded bg-[#155EEF] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Submit for review
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-surface-border bg-surface-raised p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-faint">My submissions</h2>
        {(submissions.data?.submissions ?? []).length === 0 ? (
          <p className="text-sm text-ink-faint">Nothing submitted yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-surface-border/60">
              {(submissions.data?.submissions ?? []).map((s) => (
                <tr key={s.id}>
                  <td className="py-2 text-ink">
                    {s.title}
                    <span className="block text-xs text-ink-faint">
                      v{s.version} · {s.itemCount} items
                      {s.status === 'FLAGGED' && ` · ${s.duplicateHits} dup / ${s.leakedPhraseHits} phrase flags`}
                      {s.status === 'PUBLISHED' && ` · ${s.acceptedItemCount} accepted`}
                    </span>
                    {s.reviewNote && <span className="block text-xs text-amber-600 dark:text-amber-400">Reviewer: {s.reviewNote}</span>}
                  </td>
                  <td className="py-2">
                    <span className="rounded-full bg-black/20 px-2 py-0.5 text-xs">{s.status}</span>
                  </td>
                  <td className="py-2 text-right">
                    {['DRAFT', 'SUBMITTED', 'SME_REVIEW', 'CHANGES_REQUIRED', 'FLAGGED'].includes(s.status) && (
                      <button type="button" onClick={() => withdraw.mutate(s.id)} className="text-xs text-[#B32D1A] hover:underline">
                        withdraw
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-xl border border-surface-border bg-surface-raised p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-faint">Creator earnings</h2>
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'In hold', v: earnings.data?.totals.pendingMinor },
            { label: 'Payable', v: earnings.data?.totals.payableMinor },
            { label: 'Paid', v: earnings.data?.totals.paidMinor },
            { label: 'Reversed', v: earnings.data?.totals.reversedMinor },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-surface-border px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-ink-faint">{s.label}</p>
              <p className="mt-0.5 text-sm font-bold text-ink">{formatMoney(s.v ?? 0, 'INR')}</p>
            </div>
          ))}
        </div>
        {(earnings.data?.earnings ?? []).length === 0 ? (
          <p className="text-sm text-ink-faint">
            No earnings yet. They are generated when your accepted content is published, then held for a correction
            window before becoming payable.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-surface-border/60">
              {(earnings.data?.earnings ?? []).map((e) => (
                <tr key={e.id}>
                  <td className="py-2 text-ink">{e.type.replace(/_/g, ' ').toLowerCase()}</td>
                  <td className="py-2 text-ink-faint">{e.qty > 1 ? `${e.qty} items` : ''}</td>
                  <td className="py-2 font-semibold text-ink">{formatMoney(e.netMinor, 'INR')}</td>
                  <td className="py-2 text-ink-faint">{e.holdUntil ? new Date(e.holdUntil).toLocaleDateString() : '-'}</td>
                  <td className="py-2">
                    <span className="rounded-full bg-black/20 px-2 py-0.5 text-xs">{e.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {(roles.data?.roles ?? []).some((r) => r.status === 'APPROVED') && (
        <section className="rounded-xl border border-surface-border bg-surface-raised p-5">
          <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-ink-faint">Publish to the catalog</h2>
          <p className="mb-4 text-sm text-ink-faint">
            Submit a full course/quiz for admin review. Once approved and published, it appears in
            the public catalog for any student to find and buy.
          </p>
          <CatalogSubmissionForm />
        </section>
      )}
    </div>
  );
}
