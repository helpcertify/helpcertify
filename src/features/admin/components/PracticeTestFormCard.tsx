import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { contentAdminApi, type PracticeTestSummary, type ParseErrorEntry } from '../api/contentAdminApi';
import { uploadContentFile } from '../api/uploadApi';
import { downloadTemplate } from '@/lib/downloadTemplate';
import { UploadReport } from '@/components/common/UploadReport';
import { CategorySelect } from '@/components/common/CategorySelect';
import { useUiStore } from '@/store/useUiStore';
import { toDate } from '@/utils/formatDate';
import { majorToMinor, minorToMajor } from '@/utils/currency';
import { DateTime12hInput } from '@/components/common/DateTime12hInput';
import { SKILL_LEVELS } from '@/types/models';
import type { QuestionSourceFormat, SkillLevel } from '@/types/models';

// Quick availability-window shortcuts — 1 Day/5 Days/1 Week/1 Month/3
// Months/6 Months/1 Year, on request, since manually picking both From and
// Until dates every time was slow. Picking one sets Until to (From, or now
// if From is blank) + that duration; From is only auto-filled when it was
// empty, never overwritten if the admin already set it.
const AVAILABILITY_PRESETS: { label: string; unit: 'day' | 'month' | 'year'; amount: number }[] = [
  { label: '1 Day', unit: 'day', amount: 1 },
  { label: '5 Days', unit: 'day', amount: 5 },
  { label: '1 Week', unit: 'day', amount: 7 },
  { label: '1 Month', unit: 'month', amount: 1 },
  { label: '3 Months', unit: 'month', amount: 3 },
  { label: '6 Months', unit: 'month', amount: 6 },
  { label: '1 Year', unit: 'year', amount: 1 },
];

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
  const [category, setCategory] = useState(editingTest?.category ?? 'Other');
  const [skillLevel, setSkillLevel] = useState<SkillLevel>(editingTest?.skillLevel ?? 'Foundation');
  const [description, setDescription] = useState(editingTest?.description ?? '');
  const [availableFrom, setAvailableFrom] = useState(toLocalInputValue(editingTest?.availableFrom));
  const [availableUntil, setAvailableUntil] = useState(toLocalInputValue(editingTest?.availableUntil));
  // null durationPerSessionMinutes means the admin is leaving session length
  // up to each student (see api/practice-session.ts) — studentChoosesDuration
  // just toggles which of these two the form is currently in; the number
  // input itself is disabled while it's on, and the stored value is null
  // rather than whatever stale number is still sitting in the field.
  const [studentChoosesDuration, setStudentChoosesDuration] = useState(
    isEditing && editingTest?.durationPerSessionMinutes == null
  );
  const [durationPerSessionMinutes, setDurationPerSessionMinutes] = useState(
    editingTest?.durationPerSessionMinutes?.toString() ?? '60'
  );
  const [defaultInitialBatchSize, setDefaultInitialBatchSize] = useState(
    editingTest?.defaultInitialBatchSize?.toString() ?? '50'
  );
  const [previewQuestionCount, setPreviewQuestionCount] = useState(editingTest?.previewQuestionCount?.toString() ?? '5');
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

  const applyAvailabilityPreset = (unit: 'day' | 'month' | 'year', amount: number) => {
    const start = availableFrom ? new Date(availableFrom) : new Date();
    if (!availableFrom) setAvailableFrom(toLocalInputValue(start));
    const end = new Date(start);
    if (unit === 'day') end.setDate(end.getDate() + amount);
    else if (unit === 'month') end.setMonth(end.getMonth() + amount);
    else end.setFullYear(end.getFullYear() + amount);
    setAvailableUntil(toLocalInputValue(end));
  };

  const resetForm = () => {
    setTitle('');
    setCategory('Other');
    setSkillLevel('Foundation');
    setDescription('');
    setAvailableFrom('');
    setAvailableUntil('');
    setStudentChoosesDuration(false);
    setDurationPerSessionMinutes('60');
    setDefaultInitialBatchSize('50');
    setPreviewQuestionCount('5');
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
        durationPerSessionMinutes: studentChoosesDuration ? null : Number(durationPerSessionMinutes),
        defaultInitialBatchSize: Number(defaultInitialBatchSize),
        previewQuestionCount: Number(previewQuestionCount) || 0,
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
        durationPerSessionMinutes: studentChoosesDuration ? null : Number(durationPerSessionMinutes),
        defaultInitialBatchSize: Number(defaultInitialBatchSize),
        previewQuestionCount: Number(previewQuestionCount) || 0,
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
          {/* spellCheck relies on the browser/OS's own dictionary (the
              familiar red squiggly underline + right-click suggestions) —
              no app-side dictionary is bundled, so acronyms like "CISM" or
              "ISACA" may get flagged even though they're correct; there's
              no way to distinguish an intentional acronym from a real typo
              without a curated exceptions list, which isn't worth building
              for this. */}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. CISM 2025 Full Bank"
            spellCheck
            className="input-dark"
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Category (certification body / vendor)">
            <CategorySelect value={category} onChange={setCategory} />
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
            {/* Shortcuts for Until, on request — sets it to From (or now,
                if From is still blank) plus the chosen duration, instead of
                picking both dates by hand every time. */}
            <div className="flex flex-wrap gap-1.5">
              {AVAILABILITY_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyAvailabilityPreset(p.unit, p.amount)}
                  className="rounded-full border border-surface-border px-3 py-1 text-xs text-ink-muted hover:border-brand-400"
                >
                  {p.label}
                </button>
              ))}
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
                disabled={studentChoosesDuration}
                className="input-dark disabled:opacity-50"
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
          {/* Optional, on request — the admin decides whether this choice
              exists at all; students never get to pick their own session
              length unless it's explicitly turned on here. */}
          <label className="mt-2 flex items-center gap-2 text-sm text-ink-muted">
            <input
              type="checkbox"
              checked={studentChoosesDuration}
              onChange={(e) => setStudentChoosesDuration(e.target.checked)}
            />
            Let students choose their own session duration instead
          </label>
        </Field>

        <Field label="Free Preview Questions (how many a non-buyer can try before purchasing)">
          <input
            type="number"
            min={0}
            max={200}
            value={previewQuestionCount}
            onChange={(e) => setPreviewQuestionCount(e.target.value)}
            placeholder="e.g. 5, or 0 to disable the free preview"
            className="input-dark"
          />
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

