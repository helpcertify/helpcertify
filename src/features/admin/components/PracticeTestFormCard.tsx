import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { contentAdminApi, type PracticeTestSummary } from '../api/contentAdminApi';
import { uploadContentFile } from '../api/uploadApi';
import { downloadTemplate } from '@/lib/downloadTemplate';
import { useUiStore } from '@/store/useUiStore';
import { toDate } from '@/utils/formatDate';
import { majorToMinor, minorToMajor } from '@/utils/currency';
import type { QuestionSourceFormat } from '@/types/models';

interface PracticeTestFormCardProps {
  editingTest?: PracticeTestSummary | null;
  onDoneEditing?: () => void;
}

// ts arrives over JSON as a serialized Firestore Timestamp ({ _seconds,
// _nanoseconds }, not { seconds }) — toDate() handles that shape; passing
// the bare (previously always-undefined) `.seconds` field here silently
// produced an empty edit-form field instead of the test's actual window.
function toLocalInputValue(ts: unknown): string {
  if (!ts) return '';
  const d = toDate(ts);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Matches the "Practice Manager" screenshot: availability window, session
// settings, question source format + upload, create.
export function PracticeTestFormCard({ editingTest, onDoneEditing }: PracticeTestFormCardProps) {
  const isEditing = !!editingTest;
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);

  const [title, setTitle] = useState(editingTest?.title ?? '');
  const [availableFrom, setAvailableFrom] = useState(toLocalInputValue(editingTest?.availableFrom));
  const [availableUntil, setAvailableUntil] = useState(toLocalInputValue(editingTest?.availableUntil));
  const [durationPerSessionMinutes, setDurationPerSessionMinutes] = useState(
    editingTest?.durationPerSessionMinutes?.toString() ?? '60'
  );
  const [defaultInitialBatchSize, setDefaultInitialBatchSize] = useState(
    editingTest?.defaultInitialBatchSize?.toString() ?? '50'
  );
  const [sourceFormat, setSourceFormat] = useState<QuestionSourceFormat>(editingTest?.sourceFormat ?? 'cisa_qa');
  const [file, setFile] = useState<File | null>(null);
  const [currency, setCurrency] = useState<'INR' | 'USD'>(editingTest?.currency ?? 'INR');
  const [price, setPrice] = useState(editingTest?.price ? minorToMajor(editingTest.price).toString() : '');
  const [originalPrice, setOriginalPrice] = useState(
    editingTest?.originalPrice ? minorToMajor(editingTest.originalPrice).toString() : ''
  );
  const [uploading, setUploading] = useState(false);

  const resetForm = () => {
    setTitle('');
    setAvailableFrom('');
    setAvailableUntil('');
    setDurationPerSessionMinutes('60');
    setDefaultInitialBatchSize('50');
    setFile(null);
    setCurrency('INR');
    setPrice('');
    setOriginalPrice('');
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Choose a file to upload');
      if (!availableFrom || !availableUntil) throw new Error('Set the availability window');
      setUploading(true);
      const fileUrl = await uploadContentFile(file);
      setUploading(false);
      return contentAdminApi.createPracticeTest({
        title,
        sourceFormat,
        fileUrl,
        availableFrom: new Date(availableFrom).toISOString(),
        availableUntil: new Date(availableUntil).toISOString(),
        durationPerSessionMinutes: Number(durationPerSessionMinutes),
        defaultInitialBatchSize: Number(defaultInitialBatchSize),
        price: price ? majorToMinor(Number(price)) : 0,
        originalPrice: originalPrice ? majorToMinor(Number(originalPrice)) : null,
        currency,
      });
    },
    onSuccess: (result) => {
      pushToast(`Practice test created with ${result.totalQuestions} questions`, 'success');
      if (result.parseErrors.length > 0) {
        pushToast(`${result.parseErrors.length} question(s) could not be parsed — see console`, 'info');
        console.warn('Practice test parse errors:', result.parseErrors);
      }
      queryClient.invalidateQueries({ queryKey: ['admin', 'practiceTests'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'dashboardStats'] });
      resetForm();
    },
    onError: (err) => {
      setUploading(false);
      pushToast(err instanceof Error ? err.message : 'Could not create practice test', 'error');
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      contentAdminApi.updatePracticeTest({
        testId: editingTest!.id,
        title,
        availableFrom: availableFrom ? new Date(availableFrom).toISOString() : undefined,
        availableUntil: availableUntil ? new Date(availableUntil).toISOString() : undefined,
        durationPerSessionMinutes: Number(durationPerSessionMinutes),
        defaultInitialBatchSize: Number(defaultInitialBatchSize),
        price: price ? majorToMinor(Number(price)) : 0,
        originalPrice: originalPrice ? majorToMinor(Number(originalPrice)) : null,
        currency,
      }),
    onSuccess: () => {
      pushToast('Practice test updated', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'practiceTests'] });
      onDoneEditing?.();
    },
    onError: () => pushToast('Could not update practice test', 'error'),
  });

  const pending = createMutation.isPending || updateMutation.isPending || uploading;

  return (
    <div className="rounded-xl border border-surface-border bg-surface-raised p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">{isEditing ? 'Edit Practice Test' : 'Practice Test Details'}</h2>
          <p className="text-sm text-ink-faint">Build a large question bank with batched, resumable sessions.</p>
        </div>
        <button
          type="button"
          onClick={() => downloadTemplate(sourceFormat)}
          className="rounded-lg border border-surface-border px-3 py-1.5 text-sm text-ink-muted hover:border-brand-400"
        >
          ↓ Template
        </button>
      </div>

      <div className="space-y-5">
        <Field label="Practice Test Title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. CISM 2025 Full Bank"
            className="input-dark"
          />
        </Field>

        <Field label="Availability Window">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs text-ink-faint">From</label>
              <input
                type="datetime-local"
                value={availableFrom}
                onChange={(e) => setAvailableFrom(e.target.value)}
                className="input-dark"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-ink-faint">Until</label>
              <input
                type="datetime-local"
                value={availableUntil}
                onChange={(e) => setAvailableUntil(e.target.value)}
                className="input-dark"
              />
            </div>
          </div>
        </Field>

        <Field label="Session Settings">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs text-ink-faint">Duration per session (min)</label>
              <input
                type="number"
                min={1}
                value={durationPerSessionMinutes}
                onChange={(e) => setDurationPerSessionMinutes(e.target.value)}
                className="input-dark"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-ink-faint">Default initial batch size</label>
              <input
                type="number"
                min={1}
                value={defaultInitialBatchSize}
                onChange={(e) => setDefaultInitialBatchSize(e.target.value)}
                className="input-dark"
              />
            </div>
          </div>
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Currency">
            <select value={currency} onChange={(e) => setCurrency(e.target.value as 'INR' | 'USD')} className="input-dark">
              <option value="INR">₹ INR</option>
              <option value="USD">$ USD</option>
            </select>
          </Field>
          <Field label={`Selling Price (0 = free, in ${currency === 'INR' ? '₹' : '$'})`}>
            <input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" className="input-dark" />
          </Field>
          <Field label="Marketing Price (optional — shown struck through)">
            <input
              type="number"
              min={0}
              step="0.01"
              value={originalPrice}
              onChange={(e) => setOriginalPrice(e.target.value)}
              placeholder="Leave blank for no discount display"
              className="input-dark"
            />
          </Field>
        </div>

        {!isEditing && (
          <>
            <Field label="Question Source Format">
              <div className="grid grid-cols-2 gap-3">
                <FormatButton active={sourceFormat === 'cisa_qa'} label="CISA Q&A (.docx)" onClick={() => setSourceFormat('cisa_qa')} />
                <FormatButton
                  active={sourceFormat === 'standard'}
                  label="Standard Template (.docx)"
                  onClick={() => setSourceFormat('standard')}
                />
              </div>
            </Field>

            <Field label={sourceFormat === 'cisa_qa' ? 'Upload CISA Q&A .docx (with "Answer: X" line)' : 'Upload Quiz File (.docx)'}>
              <input
                type="file"
                accept=".docx"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-ink-muted file:mr-3 file:rounded-lg file:border-0 file:bg-brand-500 file:px-3 file:py-2 file:text-sm file:font-medium file:text-surface"
              />
            </Field>
          </>
        )}

        <button
          type="button"
          disabled={pending || !title || (!isEditing && !file)}
          onClick={() => (isEditing ? updateMutation.mutate() : createMutation.mutate())}
          className="w-full rounded-lg bg-brand-gradient py-3 font-medium text-surface disabled:opacity-50"
        >
          {uploading ? 'Uploading…' : pending ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Practice Test'}
        </button>
        {isEditing && (
          <button type="button" onClick={onDoneEditing} className="w-full rounded-lg border border-surface-border py-2 text-sm text-ink-muted">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</label>
      {children}
    </div>
  );
}

function FormatButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-4 py-3 text-left text-sm font-medium ${
        active ? 'border-brand-400 bg-brand-500/15 text-brand-300' : 'border-surface-border text-ink-muted'
      }`}
    >
      {label}
    </button>
  );
}
