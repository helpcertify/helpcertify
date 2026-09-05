import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUiStore } from '@/store/useUiStore';
import { errorText } from '@/lib/errorMessages';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { CategorySelect } from '@/components/common/CategorySelect';
import { uploadContentFile } from '@/features/admin/api/uploadApi';
import { downloadTemplate } from '@/lib/downloadTemplate';
import { majorToMinor, formatMoney } from '@/utils/currency';
import { catalogSubmissionApi, type MyCatalogSubmission } from '../api/catalogSubmissionApi';
import type { SkillLevel } from '@/types/models';

const STATUS_LABEL: Record<MyCatalogSubmission['status'], string> = {
  PENDING_REVIEW: 'Pending review',
  CHANGES_REQUESTED: 'Changes requested',
  APPROVED: 'Approved - awaiting publish',
  REJECTED: 'Rejected',
  PUBLISHED: 'Published',
};

const STATUS_CLASS: Record<MyCatalogSubmission['status'], string> = {
  PENDING_REVIEW: 'border-surface-border bg-surface-raised text-ink-muted',
  CHANGES_REQUESTED: 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  APPROVED: 'border-brand-500/40 bg-brand-500/10 text-brand-ink',
  REJECTED: 'border-red-300 bg-red-50 text-red-600 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-400',
  PUBLISHED: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
};

// Shared by TrainerWorkspacePage and CreatorWorkspacePage - either an
// active Trainer or an approved Creator may submit a full question bank
// (a whole quiz or practice test) for admin review. Nothing here goes
// live on its own: an admin must approve and then explicitly publish it
// before it becomes a real, purchasable quiz/practice test - see
// api/content-admin.ts's requireCatalogAuthor/createCatalogSubmission for
// the enforcement.
export function CatalogSubmissionForm() {
  const pushToast = useUiStore((s) => s.pushToast);
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [itemType, setItemType] = useState<'quiz' | 'practiceTest'>('quiz');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Other');
  const [skillLevel, setSkillLevel] = useState<SkillLevel>('Foundation');
  const [description, setDescription] = useState('');
  const [priceInput, setPriceInput] = useState('0');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingWithdraw, setPendingWithdraw] = useState<{ id: string; title: string } | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ['catalogSubmissions', 'mine'], queryFn: catalogSubmissionApi.listMine });

  const withdrawMutation = useMutation({
    mutationFn: (id: string) => catalogSubmissionApi.withdraw(id),
    onSuccess: () => {
      pushToast('Submission withdrawn.', 'success');
      queryClient.invalidateQueries({ queryKey: ['catalogSubmissions', 'mine'] });
    },
    onError: (err) => pushToast(errorText(err, 'Could not withdraw this submission'), 'error'),
  });

  async function handleSubmit() {
    if (!file) return;
    if (title.trim().length < 2) {
      pushToast('Give it a title first', 'error');
      return;
    }
    setUploading(true);
    try {
      const fileUrl = await uploadContentFile(file);
      const result = await catalogSubmissionApi.create({
        itemType,
        title: title.trim(),
        category,
        skillLevel,
        description: description.trim(),
        suggestedPrice: majorToMinor(Number(priceInput) || 0),
        currency: 'INR',
        fileUrl,
      });
      pushToast(
        `Submitted for review: ${result.totalQuestions} question${result.totalQuestions === 1 ? '' : 's'} parsed.` +
          (result.parseWarnings.length > 0 ? ` ${result.parseWarnings.length} warning(s) - review before submitting again if needed.` : ''),
        'success'
      );
      setTitle('');
      setDescription('');
      setPriceInput('0');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      queryClient.invalidateQueries({ queryKey: ['catalogSubmissions', 'mine'] });
    } catch (err) {
      pushToast(errorText(err, 'Could not submit this for review'), 'error');
    } finally {
      setUploading(false);
    }
  }

  const submissions = data?.submissions ?? [];

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-surface-border bg-surface-raised p-6">
        <h2 className="mb-1 text-lg font-semibold text-ink">Submit a course or quiz for review</h2>
        <p className="mb-4 text-sm text-ink-faint">
          Upload a question bank in the same format HelpCertify already uses. An admin reviews it
          before it appears in the catalog for students.
        </p>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => downloadTemplate('standard')}
            className="rounded-lg border border-surface-border px-3 py-1.5 text-xs font-medium text-ink hover:border-brand-400"
          >
            Download sample format (Standard)
          </button>
          <button
            type="button"
            onClick={() => downloadTemplate('cisa_qa')}
            className="rounded-lg border border-surface-border px-3 py-1.5 text-xs font-medium text-ink hover:border-brand-400"
          >
            Download sample format (Numbered Q&amp;A)
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-faint">Type</label>
            <select value={itemType} onChange={(e) => setItemType(e.target.value as 'quiz' | 'practiceTest')} className="input-dark w-full">
              <option value="quiz">Mock Exam (quiz)</option>
              <option value="practiceTest">Practice Test</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-faint">Skill level</label>
            <select value={skillLevel} onChange={(e) => setSkillLevel(e.target.value as SkillLevel)} className="input-dark w-full">
              <option value="Foundation">Foundation</option>
              <option value="Associate">Associate</option>
              <option value="Expert">Expert</option>
            </select>
          </div>
        </div>

        <label className="mt-3 block text-xs font-medium uppercase tracking-wide text-ink-faint">Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Server Engineer Fundamentals" className="input-dark mt-1 w-full" />

        <label className="mt-3 block text-xs font-medium uppercase tracking-wide text-ink-faint">Category</label>
        <CategorySelect value={category} onChange={setCategory} />

        <label className="mt-3 block text-xs font-medium uppercase tracking-wide text-ink-faint">Description (optional)</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="input-dark mt-1 w-full" />

        <label className="mt-3 block text-xs font-medium uppercase tracking-wide text-ink-faint">
          Suggested price (₹, admin can change this)
        </label>
        <input type="number" min={0} value={priceInput} onChange={(e) => setPriceInput(e.target.value)} className="input-dark mt-1 w-full sm:w-40" />

        <label className="mt-3 block text-xs font-medium uppercase tracking-wide text-ink-faint">Question bank (.docx)</label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".docx"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mt-1 block w-full text-sm text-ink-muted"
        />

        <button
          type="button"
          onClick={handleSubmit}
          disabled={uploading || !file}
          className="mt-4 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {uploading ? 'Submitting…' : 'Submit for review'}
        </button>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-ink">Your submissions</h2>
        {isLoading && <p className="text-sm text-ink-faint">Loading…</p>}
        {!isLoading && submissions.length === 0 && <p className="text-sm text-ink-faint">Nothing submitted yet.</p>}
        <div className="space-y-3">
          {submissions.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-surface-border bg-surface-raised p-4">
              <div>
                <div className="font-medium text-ink">{s.title}</div>
                <div className="text-xs text-ink-faint">
                  {s.totalQuestions} question{s.totalQuestions === 1 ? '' : 's'} ·{' '}
                  {formatMoney(s.suggestedPrice, s.currency)} suggested
                  {s.reviewNote && <span> · Note: {s.reviewNote}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASS[s.status]}`}>
                  {STATUS_LABEL[s.status]}
                </span>
                {(s.status === 'PENDING_REVIEW' || s.status === 'CHANGES_REQUESTED') && (
                  <button
                    type="button"
                    onClick={() => setPendingWithdraw({ id: s.id, title: s.title })}
                    className="text-xs font-medium text-red-500 hover:underline"
                  >
                    Withdraw
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={!!pendingWithdraw}
        title="Withdraw this submission?"
        message={`"${pendingWithdraw?.title}" will be removed from the review queue. You can submit it again later.`}
        confirmLabel="Withdraw"
        danger
        onConfirm={() => {
          if (pendingWithdraw) withdrawMutation.mutate(pendingWithdraw.id);
          setPendingWithdraw(null);
        }}
        onCancel={() => setPendingWithdraw(null)}
      />
    </div>
  );
}
