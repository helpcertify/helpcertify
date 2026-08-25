import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { contentAdminApi, type QuizSummary } from '../api/contentAdminApi';
import { uploadContentFile } from '../api/uploadApi';
import { downloadTemplate } from '@/lib/downloadTemplate';
import { useUiStore } from '@/store/useUiStore';
import { toDate } from '@/utils/formatDate';
import { majorToMinor, minorToMajor } from '@/utils/currency';
import { DateTime12hInput } from '@/components/common/DateTime12hInput';
import { CERTIFICATION_CATEGORIES, SKILL_LEVELS } from '@/types/models';
import type { QuestionSourceFormat, DurationType, CertificationCategory, SkillLevel } from '@/types/models';

interface QuizFormCardProps {
  editingQuiz?: QuizSummary | null;
  onDoneEditing?: () => void;
}

// ts arrives over JSON as a serialized Firestore Timestamp ({ _seconds,
// _nanoseconds }, not { seconds }) — toDate() handles that shape; passing
// the bare (previously always-undefined) `.seconds` field here silently
// produced an empty edit-form field instead of the quiz's actual scheduled time.
function toLocalInputValue(ts: unknown): string {
  if (!ts) return '';
  const d = toDate(ts);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Matches the "Exam Quiz Studio" screenshot: source format, upload, nav/scoring
// checkboxes, duration type, scheduled start, publish. Reused for edit (minus
// the file re-upload, which isn't supported — metadata-only update).
export function QuizFormCard({ editingQuiz, onDoneEditing }: QuizFormCardProps) {
  const isEditing = !!editingQuiz;
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);

  const [title, setTitle] = useState(editingQuiz?.title ?? '');
  const [category, setCategory] = useState<CertificationCategory>(editingQuiz?.category ?? 'Other');
  const [skillLevel, setSkillLevel] = useState<SkillLevel>(editingQuiz?.skillLevel ?? 'Foundation');
  const [description, setDescription] = useState(editingQuiz?.description ?? '');
  const [passMarkPercent, setPassMarkPercent] = useState(editingQuiz?.passMarkPercent?.toString() ?? '60');
  // Standard Template is the only format the create form offers now — CISA
  // Q&A was removed from this selector on request. Not a stateful choice
  // any more, just the fixed value createQuiz's schema still expects.
  // Existing quizzes created with sourceFormat 'cisa_qa' are unaffected —
  // this only governs new uploads, and editing never touches the field.
  const sourceFormat: QuestionSourceFormat = 'standard';
  const [file, setFile] = useState<File | null>(null);
  const [enforceSequentialNav, setEnforceSequentialNav] = useState(editingQuiz?.enforceSequentialNav ?? false);
  const [showImmediateResult, setShowImmediateResult] = useState(editingQuiz?.showImmediateResult ?? false);
  const [showFinalScore, setShowFinalScore] = useState(editingQuiz?.showFinalScore ?? true);
  const [durationType, setDurationType] = useState<DurationType>(editingQuiz?.durationType ?? 'overall');
  const [durationMinutes, setDurationMinutes] = useState(editingQuiz?.durationMinutes?.toString() ?? '60');
  const [blockAltTab, setBlockAltTab] = useState(editingQuiz?.antiCheat?.blockAltTab ?? true);
  const [scheduledStart, setScheduledStart] = useState(toLocalInputValue(editingQuiz?.scheduledStart));
  const [totalQuestions, setTotalQuestions] = useState<number | null>(editingQuiz?.totalQuestions ?? null);
  const [currency, setCurrency] = useState<'INR' | 'USD'>(editingQuiz?.currency ?? 'INR');
  const [price, setPrice] = useState(editingQuiz?.price ? minorToMajor(editingQuiz.price).toString() : '');
  const [originalPrice, setOriginalPrice] = useState(
    editingQuiz?.originalPrice ? minorToMajor(editingQuiz.originalPrice).toString() : ''
  );
  const [uploading, setUploading] = useState(false);

  const calculatedDuration = useMemo(() => {
    const perUnit = Number(durationMinutes) || 0;
    if (durationType === 'per_question') return perUnit * (totalQuestions ?? 0);
    return perUnit;
  }, [durationType, durationMinutes, totalQuestions]);

  const resetForm = () => {
    setTitle('');
    setCategory('Other');
    setSkillLevel('Foundation');
    setDescription('');
    setPassMarkPercent('60');
    setFile(null);
    setEnforceSequentialNav(false);
    setShowImmediateResult(false);
    setShowFinalScore(true);
    setDurationType('overall');
    setDurationMinutes('60');
    setBlockAltTab(true);
    setScheduledStart('');
    setTotalQuestions(null);
    setCurrency('INR');
    setPrice('');
    setOriginalPrice('');
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Choose a file to upload');
      setUploading(true);
      const fileUrl = await uploadContentFile(file);
      setUploading(false);
      return contentAdminApi.createQuiz({
        title,
        category,
        skillLevel,
        description,
        passMarkPercent: Number(passMarkPercent) || 60,
        sourceFormat,
        fileUrl,
        durationType,
        durationMinutes: Number(durationMinutes),
        enforceSequentialNav,
        showImmediateResult,
        showFinalScore,
        blockAltTab,
        scheduledStart: scheduledStart ? new Date(scheduledStart).toISOString() : undefined,
        price: price ? majorToMinor(Number(price)) : 0,
        originalPrice: originalPrice ? majorToMinor(Number(originalPrice)) : null,
        currency,
      });
    },
    onSuccess: (result) => {
      pushToast(`Quiz published with ${result.totalQuestions} questions`, 'success');
      if (result.parseErrors.length > 0) {
        pushToast(`${result.parseErrors.length} question(s) could not be parsed. See console for details.`, 'info');
        console.warn('Quiz parse errors:', result.parseErrors);
      }
      queryClient.invalidateQueries({ queryKey: ['admin', 'quizzes'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'dashboardStats'] });
      resetForm();
    },
    onError: (err) => {
      setUploading(false);
      pushToast(err instanceof Error ? err.message : 'Could not publish quiz', 'error');
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      contentAdminApi.updateQuiz({
        quizId: editingQuiz!.id,
        title,
        category,
        skillLevel,
        description,
        passMarkPercent: Number(passMarkPercent) || 60,
        durationType,
        durationMinutes: Number(durationMinutes),
        enforceSequentialNav,
        showImmediateResult,
        showFinalScore,
        blockAltTab,
        scheduledStart: scheduledStart ? new Date(scheduledStart).toISOString() : null,
        price: price ? majorToMinor(Number(price)) : 0,
        originalPrice: originalPrice ? majorToMinor(Number(originalPrice)) : null,
        currency,
      }),
    onSuccess: () => {
      pushToast('Quiz updated', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'quizzes'] });
      onDoneEditing?.();
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : 'Could not update quiz', 'error'),
  });

  const pending = createMutation.isPending || updateMutation.isPending || uploading;

  return (
    <div className="rounded-xl border border-surface-border bg-surface-raised p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-ink">{isEditing ? 'Edit Quiz' : 'Quiz Configuration'}</h2>
          <p className="text-sm text-ink-faint">Build production-ready real-test quizzes with strict timing and response behavior.</p>
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
        <Field label="Title">
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

        <Field label="Pass Mark (% correct needed to earn a certificate)">
          <input
            type="number"
            min={1}
            max={100}
            value={passMarkPercent}
            onChange={(e) => setPassMarkPercent(e.target.value)}
            className="input-dark"
          />
        </Field>

        <Field label="Description (shown on the student-facing detail page)">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="What this quiz covers, who it's for, what to expect…"
            className="input-dark"
          />
        </Field>

        {!isEditing && (
          <Field label="Upload Quiz File (.docx)">
            <input
              type="file"
              accept=".docx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-ink-muted file:mr-3 file:rounded-lg file:border-0 file:bg-brand-500 file:px-3 file:py-2 file:text-sm file:font-medium file:text-surface"
            />
          </Field>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Checkbox label="Enforce sequential question navigation" checked={enforceSequentialNav} onChange={setEnforceSequentialNav} />
          <Checkbox label="Show immediate result per question" checked={showImmediateResult} onChange={setShowImmediateResult} />
          <Checkbox label="Show overall final score after submission" checked={showFinalScore} onChange={setShowFinalScore} />
          <Checkbox label="Block Alt-Tab / app-switch detection (anti-cheat)" checked={blockAltTab} onChange={setBlockAltTab} />
        </div>

        <Field label="Duration Type">
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm text-ink-muted">
              <input type="radio" checked={durationType === 'overall'} onChange={() => setDurationType('overall')} />
              Overall Time
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-muted">
              <input type="radio" checked={durationType === 'per_question'} onChange={() => setDurationType('per_question')} />
              Min Per Question
            </label>
          </div>
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={durationType === 'per_question' ? 'Minutes per question' : 'Total Duration (minutes)'}>
            <input
              type="number"
              min={1}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              className="input-dark"
            />
          </Field>
          <Field label="Calculated Duration (minutes)">
            <input
              readOnly
              value={durationType === 'per_question' && !totalQuestions ? 'Auto-calculated after upload' : calculatedDuration}
              className="input-dark opacity-70"
            />
          </Field>
        </div>

        <Field label="Scheduled start (optional)">
          <DateTime12hInput value={scheduledStart} onChange={setScheduledStart} />
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

        <button
          type="button"
          disabled={pending || !title || (!isEditing && !file)}
          onClick={() => (isEditing ? updateMutation.mutate() : createMutation.mutate())}
          className="w-full rounded-lg bg-[#1D4ED8] py-3 font-medium text-surface disabled:opacity-50"
        >
          {uploading ? 'Uploading…' : pending ? 'Saving…' : isEditing ? 'Save Changes' : 'Publish Quiz'}
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

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-ink-muted">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded" />
      {label}
    </label>
  );
}
