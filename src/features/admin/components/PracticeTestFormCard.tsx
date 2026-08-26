import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { contentAdminApi, type PracticeTestSummary, type ParseErrorEntry } from '../api/contentAdminApi';
import { uploadContentFile } from '../api/uploadApi';
import { downloadTemplate } from '@/lib/downloadTemplate';
import { UploadReport } from '@/components/common/UploadReport';
import { useUiStore } from '@/store/useUiStore';
import { toDate } from '@/utils/formatDate';
import { majorToMinor, minorToMajor } from '@/utils/currency';
import { DateTime12hInput } from '@/components/common/DateTime12hInput';
import { CERTIFICATION_CATEGORIES, SKILL_LEVELS } from '@/types/models';
import type { QuestionSourceFormat, CertificationCategory, SkillLevel } from '@/types/models';

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
  const [category, setCategory] = useState<CertificationCategory>(editingTest?.category ?? 'Other');
  const [skillLevel, setSkillLevel] = useState<SkillLevel>(editingTest?.skillLevel ?? 'Foundation');
  const [description, setDescription] = useState(editingTest?.description ?? '');
  const [availableFrom, setAvailableFrom] = useState(toLocalInputValue(editingTest?.availableFrom));
  const [availableUntil, setAvailableUntil] = useState(toLocalInputValue(editingTest?.availableUntil));
  const [durationPerSessionMinutes, setDurationPerSessionMinutes] = useState(
    editingTest?.durationPerSessionMinutes?.toString() ?? '60'
  );
  const [defaultInitialBatchSize, setDefaultInitialBatchSize] = useState(
    editingTest?.defaultInitialBatchSize?.toString() ?? '50'
  );
  // Standard Template is the only format the create form offers now — CISA
  // Q&A was removed from this selector on request. Not a stateful choice
  // any more, just the fixed value createPracticeTest's schema still
  // expects. Existing tests created with sourceFormat 'cisa_qa' are
  // unaffected — this only governs new uploads, and editing never touches
  // the field.
  const sourceFormat: QuestionSourceFormat = 'standard';
  const [file, setFile] = useState<File | null>(null);
  const [currency, setCurrency] = useState<'INR' | 'USD'>(editingTest?.currency ?? 'INR');
  const [price, setPrice] = useState(editingTest?.price ? minorToMajor(editingTest.price).toString() : '');
  const [originalPrice, setOriginalPrice] = useState(
    editingTest?.originalPrice ? minorToMajor(editingTest.originalPrice).toString() : ''
  );
  const [uploading, setUploading] = useState(false);
  // Kept separate from the form fields above so resetForm() (called right
  // after a successful create) doesn't also wipe this — an admin needs to
  // read the report after the form's already cleared for the next upload.
  const [uploadReport, setUploadReport] = useState<{
    totalQuestions: number;
    errors: ParseErrorEntry[];
    warnings: string[];
  } | null>(null);

  const resetForm = () => {
    setTitle('');
    setCategory('Other');
    setSkillLevel('Foundation');
    setDescription('');
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
        category,
        skillLevel,
        description,
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
      setUploadReport({ totalQuestions: result.totalQuestions, errors: result.parseErrors, warnings: result.parseWarnings });
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
        category,
        skillLevel,
        description,
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
          <h2 className="text-lg font-bold text-ink">{isEditing ? 'Edit Practice Test' : 'Practice Test Details'}</h2>
          <p className="text-sm text-ink-faint">Build a large question bank with batched, resumable sessions.</p>
        </div>
        <button
          type="button"
          onClick={() => downloadTemplate(sourceFormat)}
          className="rounded-lg border border-[#1D4ED8] px-3 py-1.5 text-sm text-[#1D4ED8] hover:opacity-80"
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Category (certification body / vendor)">
            <select value={category} onChange={(e) => setCategory(e.target.value as CertificationCategory)} className="input-dark">
              {CERTIFICATION_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Skill Level">
            <select value={skillLevel} onChange={(e) => setSkillLevel(e.target.value as SkillLevel)} className="input-dark">
              {SKILL_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Description (shown on the student-facing detail page)">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="What this practice test covers, who it's for, what to expect…"
            className="input-dark"
          />
        </Field>

        <Field label="Availability Window">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-ink-faint">From</label>
              <DateTime12hInput value={availableFrom} onChange={setAvailableFrom} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-ink-faint">Until</label>
              <DateTime12hInput value={availableUntil} onChange={setAvailableUntil} />
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Currency">
            <select value={currency} onChange={(e) => setCurrency(e.target.value as 'INR' | 'USD')} className="input-dark">
              <option value="INR">₹ INR</option>
              <option value="USD">$ USD</option>
            </select>
          </Field>
          <Field label={`Selling Price (0 = free, in ${currency === 'INR' ? '₹' : '$'})`}>
            <input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" className="input-dark" />
          </Field>
        </div>
        <Field label="Marketing Price (optional, shown struck through)">
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

        {!isEditing && (
          <Field label="Upload Quiz File (.docx)">
            <input
              type="file"
              accept=".docx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-ink-muted file:mr-3 file:rounded-lg file:border-0 file:bg-[#1D4ED8] file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
            />
          </Field>
        )}

        <button
          type="button"
          disabled={pending || !title || (!isEditing && !file)}
          onClick={() => (isEditing ? updateMutation.mutate() : createMutation.mutate())}
          className="w-full rounded-lg bg-[#1D4ED8] py-3 font-medium text-surface disabled:opacity-50"
        >
          {uploading ? 'Uploading…' : pending ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Practice Test'}
        </button>
        {isEditing && (
          <button type="button" onClick={onDoneEditing} className="w-full rounded-lg border border-surface-border py-2 text-sm text-ink-muted">
            Cancel
          </button>
        )}
        {uploadReport && (
          <UploadReport
            totalQuestions={uploadReport.totalQuestions}
            errors={uploadReport.errors}
            warnings={uploadReport.warnings}
            onDismiss={() => setUploadReport(null)}
          />
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

