import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { confirmDialog } from '@/store/useDialogStore';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  contentAdminApi,
  type CertificationAdminRow,
  type PackageAdminRow,
  type AuditLogEntry,
  type ParseErrorEntry,
} from '../api/contentAdminApi';
import { useUiStore } from '@/store/useUiStore';
import { toDate } from '@/utils/formatDate';
import { formatMoney, majorToMinor, minorToMajor } from '@/utils/currency';
import { CategorySelect } from '@/components/common/CategorySelect';
import { validateMockBlueprint } from '../lib/mockBlueprintValidation';
import { hasEntitlement, hasPublishablePrice, isOfferPriceValid, isOfferWindowValid } from '../lib/packageValidation';
import { computeOfferStatus } from '../lib/offerStatus';
import { slugify, uniqueSlug, nextDisplayOrder, iconForProvider, buildDisclaimer } from '../lib/certificationDefaults';
import {
  PACKAGE_TEMPLATES,
  emptyTemplateValues,
  templateToCreatePayload,
  buildPackageBenefits,
  visibleBenefits,
  applyComboDiscount,
  type ComboDiscount,
  detectTemplate,
  type TemplateId,
  type TemplateValues,
} from '../lib/packageTemplates';
import { deriveMockBlueprint, mockConfigStatus } from '../lib/deriveMockBlueprint';
import { VALIDITY_PRESETS, presetForDays } from '../lib/validityPresets';
import { uploadContentFile } from '../api/uploadApi';
import { UploadReport } from '@/components/common/UploadReport';
import { downloadTemplate } from '@/lib/downloadTemplate';
import { errorText, friendlyApiError } from '@/lib/errorMessages';
import { CERTIFICATION_ICON_KEYS, type CertificationIconKey, type DomainAllocation } from '@/types/models';

type Step = 1 | 2 | 3;
const STEP_LABELS: Record<Step, string> = { 1: 'Product Details', 2: 'Packages & Pricing', 3: 'Review & Publish' };
const TEMPLATE_ORDER: TemplateId[] = ['practice', 'mock', 'complete'];

function toInputDateTime(v: unknown): string {
  if (!v) return '';
  const d = toDate(v);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const isoOrNull = (local: string | null | undefined): string | null =>
  local ? new Date(local).toISOString() : null;

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export function CertificationEditorPage() {
  const params = useParams<{ certificationId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);

  const isNew = !params.certificationId;
  // Frozen at mount: a product created here keeps walking the wizard even
  // after the first save swaps the URL to /admin/products/:id. A product
  // opened directly by id starts in the edit layout.
  const [wizardMode] = useState(isNew);
  const [certificationId, setCertificationId] = useState<string | null>(params.certificationId ?? null);
  const [step, setStep] = useState<Step>(searchParams.get('preview') ? 3 : 1);
  const [dirty, setDirty] = useState(false);
  const previewRequested = !!searchParams.get('preview');

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  // Hold off the auto-update reload (src/lib/autoUpdate.ts) while this
  // multi-step form has unsaved edits so a mid-deploy poll can't discard them.
  useEffect(() => {
    (window as unknown as { __hcUnsaved?: boolean }).__hcUnsaved = dirty;
    return () => {
      (window as unknown as { __hcUnsaved?: boolean }).__hcUnsaved = false;
    };
  }, [dirty]);

  const { data: certData } = useQuery({ queryKey: ['admin', 'certifications'], queryFn: contentAdminApi.listCertificationsAdmin });
  const allCerts = certData?.certifications ?? [];
  const certification = certificationId ? allCerts.find((c) => c.id === certificationId) ?? null : null;

  const { data: pkgData } = useQuery({
    queryKey: ['admin', 'packages', certificationId],
    queryFn: () => contentAdminApi.listPackagesAdmin(certificationId!),
    enabled: !!certificationId,
  });
  const packages = pkgData?.packages ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'certifications'] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'packages'] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'packages', certificationId] });
  };

  const cancelSafely = async () => {
    if (
      dirty &&
      !(await confirmDialog({
        title: 'Leave without saving?',
        message: 'You have unsaved changes on this certification. They will be lost.',
        confirmLabel: 'Leave',
        cancelLabel: 'Keep editing',
        danger: true,
      }))
    )
      return;
    navigate('/admin/products');
  };

  const productDetails = (
    <StepProductDetails
      certification={certification}
      otherCerts={allCerts.filter((c) => c.id !== certificationId)}
      onDirty={() => setDirty(true)}
      onSaved={(id, opts) => {
        setCertificationId(id);
        setDirty(false);
        invalidate();
        if (!params.certificationId) navigate(`/admin/products/${id}`, { replace: true });
        pushToast('Draft saved', 'success');
        if (wizardMode && !opts?.stayOnStep) setStep(2);
      }}
    />
  );

  // Opened by id but the list query hasn't resolved yet - hold rather than
  // flash the new-product wizard for a frame.
  if (!wizardMode && !certification) {
    return (
      <div>
        <PageHeader title="Edit Exam Preparation" onCancel={cancelSafely} />
        <p className="mt-6 text-sm text-ink-faint">Loading…</p>
      </div>
    );
  }

  // --- Edit view: summary header + collapsible sections ---
  if (!wizardMode && certification) {
    return (
      <div>
        <PageHeader title={certification.name} onCancel={cancelSafely} />
        <SummaryHeader certification={certification} packages={packages} />
        <div className="mt-6 space-y-3">
          <Section title="Product Details" defaultOpen>
            {productDetails}
          </Section>
          <Section title="Question Bank">
            <QuestionBankSummary certification={certification} />
          </Section>
          <Section title="Packages & Pricing" defaultOpen>
            <StepPackages
              key={packages.map((p) => p.id).join(',')}
              certification={certification}
              packages={packages}
              onChanged={() => { invalidate(); setDirty(false); }}
            />
          </Section>
          <Section title="Review & Publish" defaultOpen={previewRequested}>
            <StepReview certification={certification} packages={packages} onChanged={invalidate} />
          </Section>
          <Section title="Mock Exam Settings">
            <MockConfigSection certification={certification} onChanged={invalidate} />
          </Section>
          <Section title="Certificate Settings">
            <CertificateInfo certification={certification} />
          </Section>
          <Section title="Advanced Settings">
            <AdvancedActions certification={certification} onChanged={invalidate} />
          </Section>
        </div>
      </div>
    );
  }

  // --- New-product wizard ---
  return (
    <div>
      <PageHeader title={isNew ? 'Create Exam Preparation' : certification?.name ?? 'Edit Exam Preparation'} onCancel={cancelSafely} />
      <p className="mb-6 text-sm text-ink-faint">
        {step === 1
          ? 'Name the exam preparation and connect its question bank. Everything technical is filled in for you.'
          : STEP_LABELS[step]}
      </p>

      <div className="mb-6 flex flex-wrap gap-1 border-b border-surface-border">
        {([1, 2, 3] as Step[]).map((s) => (
          <button
            key={s}
            type="button"
            disabled={s > 1 && !certificationId}
            onClick={() => setStep(s)}
            className={`border-b-2 px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
              step === s ? 'border-brand-500 text-brand-ink' : 'border-transparent text-ink-faint hover:text-ink'
            }`}
          >
            {s}. {STEP_LABELS[s]}
          </button>
        ))}
      </div>

      {step === 1 && productDetails}
      {step === 2 && certificationId && certification && (
        <StepPackages certification={certification} packages={packages} onChanged={() => { invalidate(); setDirty(false); }} />
      )}
      {step === 3 && certificationId && certification && (
        <StepReview
          certification={certification}
          packages={packages}
          onChanged={invalidate}
          onBack={() => setStep(2)}
        />
      )}
      {step !== 1 && !certificationId && (
        <p className="rounded-xl border border-dashed border-surface-border p-8 text-center text-sm text-ink-faint">
          Save Product Details first to unlock Packages and Review.
        </p>
      )}

      {step !== 3 && (
        <div className="mt-6 flex justify-between">
          <button
            type="button"
            disabled={step === 1}
            onClick={() => setStep((s) => (s - 1) as Step)}
            className="rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted disabled:opacity-40"
          >
            ← Back
          </button>
          <button
            type="button"
            disabled={!certificationId}
            onClick={() => setStep((s) => (s + 1) as Step)}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function PageHeader({ title, onCancel }: { title: string; onCancel: () => void }) {
  return (
    <div className="mb-1 flex items-center justify-between">
      <h1 className="text-2xl font-bold text-ink">{title}</h1>
      <button type="button" onClick={onCancel} className="text-sm text-ink-faint hover:text-ink">
        Cancel
      </button>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-surface-border px-3 py-2 text-sm text-ink">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />
      {label}
    </label>
  );
}

function Section({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group rounded-xl border border-surface-border bg-surface-raised">
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 font-medium text-ink">
        {title}
        <span className="text-ink-faint transition group-open:rotate-180">▾</span>
      </summary>
      <div className="border-t border-surface-border p-5">{children}</div>
    </details>
  );
}

function Disclosure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="mt-3 rounded-lg border border-surface-border">
      <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-ink-muted">{label}</summary>
      <div className="border-t border-surface-border p-3">{children}</div>
    </details>
  );
}

function ValiditySelect({ days, onChange }: { days: number; onChange: (d: number) => void }) {
  const preset = presetForDays(days);
  const isCustom = days > 0 && !preset;
  const [custom, setCustom] = useState(isCustom);
  const selectValue = custom || isCustom ? 'custom' : String(days);
  return (
    <div className="space-y-2">
      <select
        value={selectValue}
        onChange={(e) => {
          if (e.target.value === 'custom') {
            setCustom(true);
            return;
          }
          setCustom(false);
          onChange(Number(e.target.value));
        }}
        className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink"
      >
        {VALIDITY_PRESETS.map((p) => (
          <option key={p.days} value={p.days}>
            {p.label}
          </option>
        ))}
        <option value="custom">Custom...</option>
      </select>
      {(custom || isCustom) && (
        <input
          type="number"
          min={1}
          value={days || ''}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
          placeholder="Days of access"
          className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink"
        />
      )}
    </div>
  );
}

function ComboSavingField({ value, onChange }: { value: ComboDiscount | null; onChange: (d: ComboDiscount | null) => void }) {
  const mode = value?.mode ?? 'percent';
  const amount = value?.value ?? 0;
  return (
    <div className="flex items-center gap-2">
      <select
        value={mode}
        onChange={(e) => onChange(amount > 0 ? { mode: e.target.value as ComboDiscount['mode'], value: 0 } : null)}
        className="rounded-lg border border-surface-border bg-surface px-2 py-1.5 text-xs text-ink"
      >
        <option value="percent">Percent %</option>
        <option value="amount">Amount off (₹)</option>
      </select>
      <input
        type="number"
        min={0}
        value={(mode === 'amount' ? minorToMajor(amount) : amount) || ''}
        onChange={(e) => {
          const v = Math.max(0, Number(e.target.value));
          onChange(v <= 0 ? null : { mode, value: mode === 'amount' ? majorToMinor(v) : v });
        }}
        placeholder={mode === 'percent' ? '% off the combined price' : '₹ waived'}
        className="w-40 rounded-lg border border-surface-border bg-surface px-2 py-1.5 text-xs text-ink"
      />
    </div>
  );
}

function BatchedSeriesPanel({
  certificationId,
  resolveCertificationId,
  canCreate,
  examName,
  category,
  currentSeriesId,
  onGenerated,
}: {
  certificationId: string | null;
  // Saves the draft (if needed) and resolves to its id. Called on Generate
  // when the exam preparation has not been saved yet.
  resolveCertificationId: () => Promise<string>;
  // Whether the draft has enough to be created (exam code + name).
  canCreate: boolean;
  examName: string;
  category: string;
  currentSeriesId: string | null;
  onGenerated: () => void;
}) {
  const pushToast = useUiStore((s) => s.pushToast);
  const [file, setFile] = useState<File | null>(null);
  const [sourceFormat, setSourceFormat] = useState<'standard' | 'cisa_qa'>('standard');
  const [practiceBatchSize, setPracticeBatchSize] = useState('150');
  const [mockCount, setMockCount] = useState('5');
  const [mockBatchSize, setMockBatchSize] = useState('150');
  const [mockDurationMinutes, setMockDurationMinutes] = useState('240');
  const [passMarkPercent, setPassMarkPercent] = useState('60');
  const [uploading, setUploading] = useState(false);
  const [report, setReport] = useState<{ totalQuestions: number; errors: ParseErrorEntry[]; warnings: string[] } | null>(null);

  const gen = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Choose a question document to upload');
      const certId = certificationId ?? (await resolveCertificationId());
      setUploading(true);
      try {
        const fileUrl = await uploadContentFile(file);
        return await contentAdminApi.createBatchedSeries({
          certificationId: certId,
          fileUrl,
          sourceFormat,
          examName: examName.trim(),
          category: category.trim() || 'Other',
          practiceBatchSize: Number(practiceBatchSize) || 150,
          mockCount: Number(mockCount) || 5,
          mockBatchSize: Number(mockBatchSize) || 150,
          mockDurationMinutes: Number(mockDurationMinutes) || 240,
          passMarkPercent: Number(passMarkPercent) || 60,
          previewQuestionCount: 5,
          durationPerSessionMinutes: null,
        });
      } finally {
        setUploading(false);
      }
    },
    onSuccess: (r) => {
      pushToast(
        `Generated ${r.practiceTestIds.length} practice batches and ${r.mockQuizIds.length} mock exams from ${r.totalQuestions} questions`,
        'success',
      );
      setReport({ totalQuestions: r.totalQuestions, errors: r.parseErrors, warnings: r.parseWarnings });
      setFile(null);
      onGenerated();
    },
    onError: (err) => pushToast(cleanError(err, 'Could not generate the batched question set'), 'error'),
  });

  return (
    <div className="rounded-xl border border-brand-500/30 bg-brand-50 p-4 dark:bg-brand-500/10">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-bold text-ink">Generate batched question set</h3>
        <button
          type="button"
          onClick={() => downloadTemplate(sourceFormat)}
          className="shrink-0 rounded-lg border border-brand-500 px-2.5 py-1 text-xs text-brand-ink hover:opacity-80"
        >
          ↓ Template
        </button>
      </div>
      <p className="mt-1 text-xs text-ink-muted">
        Upload one large question document (.docx). It is split into practice exam batches (no question repeats across
        batches, every question covered) plus fixed mock exams that shuffle question and option order on every attempt.
        Learners unlock these by buying a package. The document must match the template - use the button above for the exact
        format.
      </p>
      {currentSeriesId && (
        <p className="mt-2 rounded-lg bg-surface-raised px-3 py-2 text-xs text-ink-muted">
          A series is already linked to this exam preparation. Generating again creates a new set of batches.
        </p>
      )}
      <div className="mt-3 space-y-3">
        <Field label="Question document">
          <input
            type="file"
            accept=".docx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-ink"
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Source format">
            <select
              value={sourceFormat}
              onChange={(e) => setSourceFormat(e.target.value as 'standard' | 'cisa_qa')}
              className="input-dark"
            >
              <option value="standard">Standard</option>
              <option value="cisa_qa">CISA Q&amp;A</option>
            </select>
          </Field>
          <Field label="Questions per practice batch">
            <input type="number" min={1} value={practiceBatchSize} onChange={(e) => setPracticeBatchSize(e.target.value)} className="input-dark" />
          </Field>
          <Field label="Number of mock exams">
            <input type="number" min={1} value={mockCount} onChange={(e) => setMockCount(e.target.value)} className="input-dark" />
          </Field>
          <Field label="Questions per mock exam">
            <input type="number" min={1} value={mockBatchSize} onChange={(e) => setMockBatchSize(e.target.value)} className="input-dark" />
          </Field>
          <Field label="Mock exam duration (minutes)">
            <input type="number" min={1} value={mockDurationMinutes} onChange={(e) => setMockDurationMinutes(e.target.value)} className="input-dark" />
          </Field>
          <Field label="Pass mark (%)">
            <input type="number" min={0} max={100} value={passMarkPercent} onChange={(e) => setPassMarkPercent(e.target.value)} className="input-dark" />
          </Field>
        </div>
        <button
          type="button"
          disabled={!file || !canCreate || gen.isPending || uploading}
          onClick={() => gen.mutate()}
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {uploading ? 'Uploading...' : gen.isPending ? 'Generating...' : 'Generate batches'}
        </button>
        {!canCreate && (
          <p className="text-xs text-ink-faint">Enter an exam code and name above first - the draft saves automatically.</p>
        )}
      </div>
      {report && (
        <UploadReport
          totalQuestions={report.totalQuestions}
          errors={report.errors}
          warnings={report.warnings}
          onDismiss={() => setReport(null)}
        />
      )}
    </div>
  );
}

function SummaryHeader({ certification, packages }: { certification: CertificationAdminRow; packages: PackageAdminRow[] }) {
  const activePackages = packages.filter((p) => p.status === 'published' || p.status === 'draft').length;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-surface-border bg-surface-raised px-5 py-4 text-sm">
      <span className="font-semibold text-ink">{certification.name}</span>
      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${certification.status === 'published' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-neutral-500/15 text-ink-faint'}`}>
        {certification.status}
      </span>
      {certification.practiceBankId && <span className="text-ink-faint">Practice bank linked</span>}
      {certification.mockBankId && <span className="text-ink-faint">Mock bank linked</span>}
      <span className="text-ink-faint">{activePackages} active package{activePackages === 1 ? '' : 's'}</span>
      <span className="text-ink-faint">Updated {toDate(certification.updatedAt).toLocaleDateString()}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 - Product Details
// ---------------------------------------------------------------------------

function StepProductDetails({
  certification,
  otherCerts,
  onDirty,
  onSaved,
}: {
  certification: CertificationAdminRow | null;
  otherCerts: CertificationAdminRow[];
  onDirty: () => void;
  onSaved: (id: string, opts?: { stayOnStep?: boolean }) => void;
}) {
  const pushToast = useUiStore((s) => s.pushToast);
  const queryClient = useQueryClient();
  const savingForUploadRef = useRef(false);
  const { data: tests } = useQuery({ queryKey: ['admin', 'practiceTests'], queryFn: contentAdminApi.listPracticeTestsAdmin });
  const { data: quizzes } = useQuery({ queryKey: ['admin', 'quizzes'], queryFn: contentAdminApi.listQuizzesAdmin });

  const [shortName, setShortName] = useState(certification?.shortName ?? '');
  const [name, setName] = useState(certification?.name ?? '');
  const [provider, setProvider] = useState(certification?.provider ?? 'Other');
  const [practiceBankId, setPracticeBankId] = useState(certification?.practiceBankId ?? '');
  const [mockBankId, setMockBankId] = useState(certification?.mockBankId ?? '');
  const [shortDescription, setShortDescription] = useState(certification?.shortDescription ?? '');
  const [defaultValidityDays, setDefaultValidityDays] = useState(String(certification?.defaultValidityDays ?? 180));

  // "Add more product information"
  const [description, setDescription] = useState(certification?.description ?? '');
  const [featured, setFeatured] = useState(certification?.featured ?? false);

  // Advanced Settings - auto-filled, overridable
  const [advOpen, setAdvOpen] = useState(false);
  const [slugTouched, setSlugTouched] = useState(!!certification);
  const [slug, setSlug] = useState(certification?.slug ?? '');
  const [category, setCategory] = useState(certification?.category ?? '');
  const [iconKey, setIconKey] = useState<CertificationIconKey>(certification?.iconKey ?? 'shield');
  const [iconTouched, setIconTouched] = useState(!!certification);
  const [effectiveFrom, setEffectiveFrom] = useState(toInputDateTime(certification?.effectiveFrom));
  const [effectiveTo, setEffectiveTo] = useState(toInputDateTime(certification?.effectiveTo));
  const [displayOrder, setDisplayOrder] = useState(certification ? String(certification.displayOrder) : '');
  const [disclaimer, setDisclaimer] = useState(certification?.independentPrepDisclaimer ?? '');
  const [disclaimerTouched, setDisclaimerTouched] = useState(!!certification?.independentPrepDisclaimer);

  const touched = () => onDirty();

  // Keep the auto-generated values in step with the primary fields until the
  // admin overrides one of them in Advanced Settings.
  const autoSlug = useMemo(
    () => uniqueSlug(slugify(shortName || name), otherCerts.map((c) => c.slug)),
    [shortName, name, otherCerts],
  );
  const effectiveSlug = slugTouched && slug ? slug.trim().toLowerCase() : autoSlug;
  const effectiveCategory = category.trim() || provider;
  const effectiveIcon = iconTouched ? iconKey : iconForProvider(provider);
  const effectiveDisclaimer = disclaimerTouched ? disclaimer : buildDisclaimer(shortName, provider);
  const effectiveDisplayOrder = displayOrder !== '' ? Number(displayOrder) : nextDisplayOrder(otherCerts);

  const practiceBanks = tests?.practiceTests ?? [];
  const quizBanks = (quizzes?.quizzes ?? []).filter((q) => q.isPublished);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        shortName: shortName.trim(),
        name: name.trim(),
        provider,
        slug: effectiveSlug,
        category: effectiveCategory,
        shortDescription,
        description,
        iconKey: effectiveIcon,
        effectiveFrom: effectiveFrom ? new Date(effectiveFrom).toISOString() : null,
        effectiveTo: effectiveTo ? new Date(effectiveTo).toISOString() : null,
        defaultValidityDays: Number(defaultValidityDays) || 180,
        featured,
        independentPrepDisclaimer: effectiveDisclaimer,
        displayOrder: effectiveDisplayOrder,
        practiceBankId: practiceBankId || null,
        mockBankId: mockBankId || null,
      };
      const id = certification
        ? await contentAdminApi.updateCertification({ certificationId: certification.id, ...payload }).then(() => certification.id)
        : await contentAdminApi.createCertification(payload).then((r) => r.certificationId);

      // Auto-create the single quiz content version the mock blueprint hangs
      // off, the first time a mock bank is chosen.
      if (mockBankId) {
        const existingVersions = certification?.contentVersions ?? [];
        const alreadyLinked = existingVersions.some((v) => v.associatedBankId === mockBankId);
        if (!alreadyLinked) {
          try {
            await contentAdminApi.saveContentVersion(id, {
              versionName: `${shortName.trim() || 'Exam'} - current outline`,
              versionCode: `${effectiveSlug}-v1`.slice(0, 50),
              associatedBankType: 'quiz',
              associatedBankId: mockBankId,
              effectiveFrom: new Date().toISOString(),
              effectiveTo: null,
              status: 'active',
              notes: 'Auto-created from the simplified product form',
            });
          } catch (e) {
            pushToast(errorText(e, 'Saved, but the mock question bank could not be linked'), 'error');
          }
        }
      }
      return id;
    },
    onSuccess: (id) => onSaved(id, { stayOnStep: savingForUploadRef.current }),
    onError: (err) => pushToast(cleanError(err, 'Could not save the exam preparation'), 'error'),
  });

  // An exam code and name are enough to save a draft. The practice content
  // can come either from linking an existing bank below or from generating
  // batches from an uploaded doc (which needs the draft to exist first).
  const canSave = shortName.trim().length > 0 && name.trim().length >= 2;

  // Returns the id of the saved exam preparation, creating the draft first
  // if it does not exist yet - lets the batch uploader work straight from
  // the "new" screen without a separate "Save Draft" click. The ref keeps
  // that auto-save from bouncing the wizard to step 2 mid-upload.
  const ensureSavedId = async (): Promise<string> => {
    if (certification) return certification.id;
    savingForUploadRef.current = true;
    try {
      return await saveMutation.mutateAsync();
    } finally {
      savingForUploadRef.current = false;
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Exam code" hint="e.g. CISM">
          <input value={shortName} onChange={(e) => { setShortName(e.target.value); touched(); }} className="input-dark" />
        </Field>
        <Field label="Exam preparation name" hint="e.g. CISM Exam Preparation">
          <input value={name} onChange={(e) => { setName(e.target.value); touched(); }} className="input-dark" />
        </Field>
        <Field label="Certification body" hint="e.g. ISACA">
          <CategorySelect value={provider} onChange={(v) => { setProvider(v); touched(); }} />
        </Field>
        <Field label="Default access validity" hint="Default for new packages. Each package can override it.">
          <ValiditySelect
            days={Number(defaultValidityDays) || 0}
            onChange={(d) => { setDefaultValidityDays(String(d)); touched(); }}
          />
        </Field>
      </div>

      <Field label="Practice question bank" hint="The bank your Practice / Complete packages draw from.">
        <select value={practiceBankId} onChange={(e) => { setPracticeBankId(e.target.value); touched(); }} className="input-dark">
          <option value="">Select a question bank…</option>
          {practiceBanks.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title} - {b.totalQuestions.toLocaleString()} questions
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Mock exam question bank (optional)"
        hint="Only needed if you'll offer Mock Exams or Complete Preparation. Timed mock exams draw from this bank."
      >
        <select value={mockBankId} onChange={(e) => { setMockBankId(e.target.value); touched(); }} className="input-dark">
          <option value="">Not set</option>
          {quizBanks.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title} - {b.totalQuestions.toLocaleString()} questions
            </option>
          ))}
        </select>
      </Field>

      <BatchedSeriesPanel
        certificationId={certification?.id ?? null}
        resolveCertificationId={ensureSavedId}
        canCreate={canSave}
        examName={shortName || name}
        category={effectiveCategory}
        currentSeriesId={certification?.seriesId ?? null}
        onGenerated={() => {
          queryClient.invalidateQueries({ queryKey: ['admin', 'certifications'] });
          queryClient.invalidateQueries({ queryKey: ['admin', 'practiceTests'] });
          queryClient.invalidateQueries({ queryKey: ['admin', 'quizzes'] });
          onDirty();
        }}
      />

      <Field
        label="Short description"
        hint={`One or two lines for the product card. ${shortDescription.length}/300. Put longer copy in "Add more product information" below.`}
      >
        <textarea
          value={shortDescription}
          onChange={(e) => { setShortDescription(e.target.value.slice(0, 300)); touched(); }}
          maxLength={300}
          rows={2}
          className="input-dark"
          placeholder="Prepare for the exam with practice questions, realistic mock exams, detailed explanations and performance analytics."
        />
      </Field>

      <Disclosure label="Add more product information">
        <div className="space-y-4">
          <Field label="Full description">
            <textarea value={description} onChange={(e) => { setDescription(e.target.value); touched(); }} rows={4} className="input-dark" />
          </Field>
          <Field label="Product icon" hint="Shown on the exam preparation card. Defaults to a match for the provider.">
            <select
              value={effectiveIcon}
              onChange={(e) => { setIconKey(e.target.value as CertificationIconKey); setIconTouched(true); touched(); }}
              className="input-dark"
            >
              {CERTIFICATION_ICON_KEYS.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={featured} onChange={(e) => { setFeatured(e.target.checked); touched(); }} className="h-4 w-4" />
            Featured product
          </label>
        </div>
      </Disclosure>

      <details open={advOpen} onToggle={(e) => setAdvOpen((e.target as HTMLDetailsElement).open)} className="rounded-lg border border-surface-border">
        <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-ink-muted">Advanced Settings</summary>
        <div className="space-y-4 border-t border-surface-border p-4">
          <p className="text-xs text-ink-faint">
            These are generated automatically. Change them only if you have a reason to.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Slug" hint={`Auto: ${autoSlug}`}>
              <input
                value={slugTouched ? slug : autoSlug}
                onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); touched(); }}
                className="input-dark"
              />
            </Field>
            <Field label="Category" hint={`Auto: ${provider}`}>
              <input value={category} onChange={(e) => { setCategory(e.target.value); touched(); }} placeholder={provider} className="input-dark" />
            </Field>
            <Field label="Display order" hint={`Auto: ${nextDisplayOrder(otherCerts)}`}>
              <input type="number" min={0} value={displayOrder} onChange={(e) => { setDisplayOrder(e.target.value); touched(); }} placeholder={String(nextDisplayOrder(otherCerts))} className="input-dark" />
            </Field>
            <div />
            <Field label="Effective from" hint="Blank = set to the publish date automatically.">
              <input type="datetime-local" value={effectiveFrom} onChange={(e) => { setEffectiveFrom(e.target.value); touched(); }} className="input-dark" />
            </Field>
            <Field label="Effective to" hint="Blank = no end date.">
              <input type="datetime-local" value={effectiveTo} onChange={(e) => { setEffectiveTo(e.target.value); touched(); }} className="input-dark" />
            </Field>
          </div>
          <Field label="Independent-preparation disclaimer" hint="Auto-generated from the exam name and provider.">
            <textarea
              value={disclaimerTouched ? disclaimer : effectiveDisclaimer}
              onChange={(e) => { setDisclaimer(e.target.value); setDisclaimerTouched(true); touched(); }}
              rows={4}
              className="input-dark"
            />
          </Field>
          {certification && <ContentVersionsPanel certification={certification} onDirty={onDirty} />}
        </div>
      </details>

      <button
        type="button"
        disabled={!canSave || saveMutation.isPending}
        onClick={() => saveMutation.mutate()}
        className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {saveMutation.isPending ? 'Saving…' : 'Save Draft'}
      </button>
      {!practiceBankId && !certification?.seriesId && !certification?.practiceBankIds?.length && (
        <p className="text-xs text-ink-faint">
          Link a practice question bank above, or upload a document to generate batches. One is required before publishing.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Question Bank summary (edit view)
// ---------------------------------------------------------------------------

function QuestionBankSummary({ certification }: { certification: CertificationAdminRow }) {
  const { data: tests } = useQuery({ queryKey: ['admin', 'practiceTests'], queryFn: contentAdminApi.listPracticeTestsAdmin });
  const { data: quizzes } = useQuery({ queryKey: ['admin', 'quizzes'], queryFn: contentAdminApi.listQuizzesAdmin });
  const practiceBankIds = certification.practiceBankIds?.length
    ? certification.practiceBankIds
    : certification.practiceBankId
      ? [certification.practiceBankId]
      : [];
  const practiceBankList = (tests?.practiceTests ?? []).filter((t) => practiceBankIds.includes(t.id));
  const practiceBank = practiceBankList[0] ?? null;
  const seriesPracticeQuestions = practiceBankList.reduce((sum, t) => sum + (t.totalQuestions ?? 0), 0);
  const mockBank = quizzes?.quizzes.find((q) => q.id === certification.mockBankId) ?? null;

  const { data: practiceDomains } = useQuery({
    queryKey: ['admin', 'bankDomainCounts', 'practiceTest', certification.practiceBankId],
    queryFn: () => contentAdminApi.getBankDomainCounts('practiceTest', certification.practiceBankId!),
    enabled: !!certification.practiceBankId,
  });

  const versions = certification.contentVersions;

  return (
    <div className="space-y-4 text-sm">
      {!practiceBank ? (
        <p className="text-ink-faint">
          No practice content yet - link a question bank or generate batches from an uploaded document in Product Details.
        </p>
      ) : (
        <div className="rounded-lg border border-surface-border p-4">
          <div className="font-medium text-ink">
            {certification.seriesId ? `${practiceBankList.length} practice batches` : practiceBank.title}
          </div>
          <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-ink-faint sm:grid-cols-2">
            <div>Published questions: <span className="text-ink">{(certification.seriesId ? seriesPracticeQuestions : practiceBank.totalQuestions).toLocaleString()}</span></div>
            <div>Domains available: <span className="text-ink">{practiceDomains ? Object.keys(practiceDomains.byDomain).length : '…'}</span></div>
            <div>Eligible for Practice: <span className="text-ink">Yes</span></div>
            <div>Eligible for Mock: <span className="text-ink">{mockBank ? 'Yes' : 'No'}</span></div>
          </dl>
          <div className="mt-3 flex gap-2">
            <Link to={`/admin/products/${certification.id}`} className="rounded-lg border border-surface-border px-3 py-1.5 text-xs text-ink-muted hover:border-brand-400">
              Change (Product Details)
            </Link>
            <Link to="/admin/practice-tests" className="rounded-lg border border-surface-border px-3 py-1.5 text-xs text-ink-muted hover:border-brand-400">
              Manage Question Bank
            </Link>
          </div>
        </div>
      )}

      {mockBank && (
        <div className="rounded-lg border border-surface-border p-4">
          <div className="font-medium text-ink">{mockBank.title} <span className="text-xs font-normal text-ink-faint">· mock exam bank</span></div>
          <div className="mt-1 text-ink-faint">Published questions: <span className="text-ink">{mockBank.totalQuestions.toLocaleString()}</span></div>
        </div>
      )}

      {versions.length > 1 && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300">
          This exam preparation has multiple outline versions. Mock rules are configured per version under Mock Exam Settings.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 - Packages & Pricing
// ---------------------------------------------------------------------------

interface CardState {
  enabled: boolean;
  values: TemplateValues;
}

function packageToValues(pkg: PackageAdminRow): TemplateValues {
  return {
    sellingPrice: pkg.sellingPrice,
    regularPrice: pkg.regularPrice > pkg.sellingPrice ? pkg.regularPrice : null,
    offerPrice: pkg.offerPrice,
    offerStart: toInputDateTime(pkg.offerStart) || null,
    offerEnd: toInputDateTime(pkg.offerEnd) || null,
    renewalPrice: pkg.renewalPrice,
    numberOfQuestions: pkg.accessibleQuestionCount,
    mockAttempts: pkg.fullMockAttempts || 5,
    questionsPerMock: pkg.questionsPerMock || 150,
    durationMinutes: pkg.mockDurationMinutes || 240,
    validityDays: pkg.accessValidityDays,
    isRecommended: pkg.isRecommended,
    benefitsOverride: pkg.includedFeatures.length ? pkg.includedFeatures : null,
    badgeText: pkg.badgeText,
    comboDiscount: pkg.comboDiscount ?? null,
  };
}

function StepPackages({
  certification,
  packages,
  onChanged,
}: {
  certification: CertificationAdminRow;
  packages: PackageAdminRow[];
  onChanged: () => void;
}) {
  const pushToast = useUiStore((s) => s.pushToast);
  const { data: allTests } = useQuery({ queryKey: ['admin', 'practiceTests'], queryFn: contentAdminApi.listPracticeTestsAdmin });
  const { data: practiceDomains } = useQuery({
    queryKey: ['admin', 'bankDomainCounts', 'practiceTest', certification.practiceBankId],
    queryFn: () => contentAdminApi.getBankDomainCounts('practiceTest', certification.practiceBankId!),
    enabled: !!certification.practiceBankId && !certification.seriesId,
  });
  // A generated series spreads its questions across many practiceTests docs;
  // sum them. A single linked bank uses the domain-count total.
  const seriesQuestionTotal = (allTests?.practiceTests ?? [])
    .filter((t) => (certification.practiceBankIds ?? []).includes(t.id))
    .reduce((sum, t) => sum + (t.totalQuestions ?? 0), 0);
  const eligiblePracticeQuestions = certification.seriesId
    ? seriesQuestionTotal || Number.MAX_SAFE_INTEGER
    : practiceDomains?.totalQuestions ?? Number.MAX_SAFE_INTEGER;

  const templatePackages = useMemo(() => {
    const map: Partial<Record<TemplateId, PackageAdminRow>> = {};
    for (const p of packages) {
      const t = detectTemplate(p);
      if (t !== 'custom' && !map[t]) map[t] = p;
    }
    return map;
  }, [packages]);

  const [cards, setCards] = useState<Record<TemplateId, CardState>>(() => {
    const base = {} as Record<TemplateId, CardState>;
    for (const id of TEMPLATE_ORDER) {
      const existing = templatePackages[id];
      base[id] = existing
        ? { enabled: true, values: packageToValues(existing) }
        : { enabled: false, values: emptyTemplateValues(certification.defaultValidityDays) };
    }
    return base;
  });

  const setCard = (id: TemplateId, patch: Partial<CardState>) => setCards((c) => ({ ...c, [id]: { ...c[id], ...patch } }));
  const setValue = (id: TemplateId, key: keyof TemplateValues, value: TemplateValues[keyof TemplateValues]) => {
    // Once the admin edits Complete's price by hand, stop auto-summing it.
    if (id === 'complete' && (key === 'sellingPrice' || key === 'regularPrice')) setCompletePriceTouched(true);
    setCards((c) => ({ ...c, [id]: { ...c[id], values: { ...c[id].values, [key]: value } } }));
  };

  // Complete Preparation = Practice Questions + Mock Exams. Kept in sync
  // automatically until the admin overrides it.
  const partsSelling = cards.practice.values.sellingPrice + cards.mock.values.sellingPrice;
  const partsRegular =
    (cards.practice.values.regularPrice ?? cards.practice.values.sellingPrice) +
    (cards.mock.values.regularPrice ?? cards.mock.values.sellingPrice);
  const [completePriceTouched, setCompletePriceTouched] = useState(() => {
    const c = templatePackages.complete;
    if (!c) return false;
    const p = templatePackages.practice?.sellingPrice ?? 0;
    const m = templatePackages.mock?.sellingPrice ?? 0;
    return p + m > 0 && c.sellingPrice !== p + m;
  });
  const comboDiscount = cards.complete.values.comboDiscount;
  useEffect(() => {
    if (completePriceTouched || partsSelling <= 0) return;
    setCards((c) => {
      const v = c.complete.values;
      const nextSelling = applyComboDiscount(partsSelling, v.comboDiscount);
      const nextRegular = partsRegular > nextSelling ? partsRegular : null;
      if (v.sellingPrice === nextSelling && v.regularPrice === nextRegular) return c;
      return { ...c, complete: { ...c.complete, values: { ...v, sellingPrice: nextSelling, regularPrice: nextRegular } } };
    });
  }, [partsSelling, partsRegular, completePriceTouched, comboDiscount]);

  const saveMutation = useMutation({
    mutationFn: async (id: TemplateId) => {
      const card = cards[id];
      const v: TemplateValues = { ...card.values, offerStart: isoOrNull(card.values.offerStart), offerEnd: isoOrNull(card.values.offerEnd) };
      const existing = templatePackages[id];
      const payload = templateToCreatePayload(id, v, {
        certificationId: certification.id,
        practiceBankIds: certification.practiceBankIds?.length
          ? certification.practiceBankIds
          : certification.practiceBankId
            ? [certification.practiceBankId]
            : [],
        mockBankIds: certification.mockBankIds?.length
          ? certification.mockBankIds
          : certification.mockBankId
            ? [certification.mockBankId]
            : [],
        eligiblePracticeQuestions,
        defaultValidityDays: certification.defaultValidityDays,
        currency: existing?.currency ?? 'INR',
        displayOrder: existing?.displayOrder ?? TEMPLATE_ORDER.indexOf(id),
      });
      if (existing) await contentAdminApi.updatePackage({ packageId: existing.id, ...payload });
      else await contentAdminApi.createPackage(payload);
    },
    onSuccess: () => { pushToast('Package saved', 'success'); onChanged(); },
    onError: (err) => pushToast(cleanError(err, 'Could not save the package'), 'error'),
  });

  return (
    <div className="space-y-4">
      {!certification.practiceBankId && !certification.seriesId && !certification.practiceBankIds?.length && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-300">
          Add practice content in Product Details first - link a question bank, or upload a document and click "Generate
          batches".
        </p>
      )}

      {TEMPLATE_ORDER.map((id) => (
        <TemplateCard
          key={id}
          id={id}
          state={cards[id]}
          existing={templatePackages[id] ?? null}
          certification={certification}
          eligiblePracticeQuestions={eligiblePracticeQuestions === Number.MAX_SAFE_INTEGER ? 0 : eligiblePracticeQuestions}
          partsSellingMinor={partsSelling}
          onToggle={(enabled) => setCard(id, { enabled })}
          onValue={(k, val) => setValue(id, k, val)}
          onSave={() => saveMutation.mutate(id)}
          saving={saveMutation.isPending}
        />
      ))}

      <PackageList packages={packages} onChanged={onChanged} />

      <Disclosure label="Add a custom package (advanced)">
        <CustomPackageForm certificationId={certification.id} onChanged={onChanged} />
      </Disclosure>
    </div>
  );
}

function TemplateCard({
  id,
  state,
  existing,
  certification,
  eligiblePracticeQuestions,
  partsSellingMinor,
  onToggle,
  onValue,
  onSave,
  saving,
}: {
  id: TemplateId;
  state: CardState;
  existing: PackageAdminRow | null;
  certification: CertificationAdminRow;
  eligiblePracticeQuestions: number;
  partsSellingMinor: number;
  onToggle: (enabled: boolean) => void;
  onValue: <K extends keyof TemplateValues>(key: K, value: TemplateValues[K]) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const def = PACKAGE_TEMPLATES[id];
  const v = state.values;
  const needsMockBank = (id === 'mock' || id === 'complete') && !certification.mockBankId;

  const money = (minor: number | null) => (minor == null ? '' : String(minorToMajor(minor)));
  const setMoney = <K extends keyof TemplateValues>(key: K, raw: string) =>
    onValue(key, (raw === '' ? null : majorToMinor(Number(raw) || 0)) as TemplateValues[K]);

  const benefits = buildPackageBenefits(id, v, eligiblePracticeQuestions || 0);
  const offerBad = !isOfferPriceValid(v.offerPrice, v.regularPrice ?? v.sellingPrice) ||
    !isOfferWindowValid(v.offerStart ? new Date(v.offerStart) : null, v.offerEnd ? new Date(v.offerEnd) : null);
  const priceBad = !hasPublishablePrice(v.sellingPrice, false);

  return (
    <div className={`rounded-xl border p-5 ${state.enabled ? 'border-brand-500 bg-brand-500/5' : 'border-surface-border bg-surface'}`}>
      <label className="flex items-start gap-3">
        <input type="checkbox" checked={state.enabled} onChange={(e) => onToggle(e.target.checked)} className="mt-1 h-4 w-4" />
        <span>
          <span className="block font-semibold text-ink">{def.name}</span>
          <span className="block text-sm text-ink-faint">{def.blurb}</span>
        </span>
      </label>

      {state.enabled && (
        <div className="mt-4 space-y-4">
          {needsMockBank && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300">
              Set a mock exam question bank in Product Details to publish this package.
            </p>
          )}
          {id === 'complete' && (
            <div className="space-y-3 rounded-lg border border-brand-500/30 bg-brand-50 p-3 text-xs text-brand-ink dark:bg-brand-500/10">
              <p>
                The price is kept as Practice Questions + Mock Exams (₹{minorToMajor(partsSellingMinor)}) minus the combo
                saving below, until you type a price by hand.
              </p>
              <ComboSavingField value={v.comboDiscount} onChange={(d) => onValue('comboDiscount', d)} />
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            <Field label="Selling price (₹)">
              <input type="number" min={0} value={money(v.sellingPrice) || ''} onChange={(e) => setMoney('sellingPrice', e.target.value)} className="input-dark" />
            </Field>
            <Field label="Regular price (₹, optional)" hint="Shown struck-through as the 'was' price.">
              <input type="number" min={0} value={money(v.regularPrice)} onChange={(e) => setMoney('regularPrice', e.target.value)} className="input-dark" />
            </Field>
            <Field label="Access validity">
              <ValiditySelect days={v.validityDays} onChange={(d) => onValue('validityDays', d)} />
            </Field>
            {def.fields.numberOfQuestions && (
              <Field label="Number of questions" hint={eligiblePracticeQuestions ? `Bank has ${eligiblePracticeQuestions.toLocaleString()} eligible` : undefined}>
                <input type="number" min={0} value={v.numberOfQuestions} onChange={(e) => onValue('numberOfQuestions', Number(e.target.value) || 0)} className="input-dark" />
              </Field>
            )}
            {def.fields.mockAttempts && (
              <Field label="Number of mock attempts">
                <input type="number" min={0} value={v.mockAttempts} onChange={(e) => onValue('mockAttempts', Number(e.target.value) || 0)} className="input-dark" />
              </Field>
            )}
            {def.fields.questionsPerMock && (
              <Field label="Questions per mock">
                <input type="number" min={0} value={v.questionsPerMock} onChange={(e) => onValue('questionsPerMock', Number(e.target.value) || 0)} className="input-dark" />
              </Field>
            )}
            {def.fields.durationMinutes && (
              <Field label="Mock duration (minutes)">
                <input type="number" min={0} value={v.durationMinutes} onChange={(e) => onValue('durationMinutes', Number(e.target.value) || 0)} className="input-dark" />
              </Field>
            )}
          </div>

          {def.fields.recommendedToggle && (
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={v.isRecommended} onChange={(e) => onValue('isRecommended', e.target.checked)} className="h-4 w-4" />
              Mark as Recommended
            </label>
          )}

          {(id === 'mock' || id === 'complete') && certification.mockBankId && (
            <MockConfigStatusChip certification={certification} questionsPerMock={v.questionsPerMock} durationMinutes={v.durationMinutes} />
          )}

          <Disclosure label="Customize package benefits">
            <Field label="Learner-visible benefits (one per line)" hint="Leave blank to use the auto-generated list below.">
              <textarea
                value={(v.benefitsOverride ?? benefits).join('\n')}
                onChange={(e) => onValue('benefitsOverride', e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
                rows={7}
                className="input-dark"
              />
            </Field>
            <button type="button" onClick={() => onValue('benefitsOverride', null)} className="mt-2 text-xs text-brand-ink hover:underline">
              Reset to auto-generated
            </button>
          </Disclosure>

          <Disclosure label="Advanced pricing & options">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Offer price (₹, optional)">
                <input type="number" min={0} value={money(v.offerPrice)} onChange={(e) => setMoney('offerPrice', e.target.value)} className="input-dark" />
              </Field>
              <Field label="Renewal price (₹, optional)">
                <input type="number" min={0} value={money(v.renewalPrice)} onChange={(e) => setMoney('renewalPrice', e.target.value)} className="input-dark" />
              </Field>
              <Field label="Offer period start">
                <input type="datetime-local" value={v.offerStart ?? ''} onChange={(e) => onValue('offerStart', e.target.value || null)} className="input-dark" />
              </Field>
              <Field label="Offer period end">
                <input type="datetime-local" value={v.offerEnd ?? ''} onChange={(e) => onValue('offerEnd', e.target.value || null)} className="input-dark" />
              </Field>
              <Field label="Badge text (optional)">
                <input value={v.badgeText ?? ''} onChange={(e) => onValue('badgeText', e.target.value || null)} placeholder="Best Value" className="input-dark" />
              </Field>
            </div>
            <p className="mt-2 text-xs text-ink-faint">
              Tax treatment, promo / referral / refund eligibility and upgrade options use safe platform defaults
              (tax-inclusive, all eligible). Use “Add a custom package” to change them.
            </p>
          </Disclosure>

          {(offerBad || priceBad) && (
            <p className="text-sm text-red-500">
              {priceBad && 'Enter a selling price greater than zero. '}
              {offerBad && 'Check the offer price and offer period.'}
            </p>
          )}

          <button
            type="button"
            disabled={saving || priceBad || offerBad}
            onClick={onSave}
            className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : existing ? 'Update package' : 'Save package'}
          </button>
        </div>
      )}
    </div>
  );
}

function MockConfigStatusChip({
  certification,
  questionsPerMock,
  durationMinutes,
}: {
  certification: CertificationAdminRow;
  questionsPerMock: number;
  durationMinutes: number;
}) {
  const { data } = useQuery({
    queryKey: ['admin', 'bankDomainCounts', 'quiz', certification.mockBankId],
    queryFn: () => contentAdminApi.getBankDomainCounts('quiz', certification.mockBankId!),
    enabled: !!certification.mockBankId,
  });
  if (!data) return null;
  const derived = deriveMockBlueprint({ byDomain: data.byDomain, totalQuestions: questionsPerMock, durationMinutes });
  const status = mockConfigStatus(derived, data.byDomain);
  return (
    <div className={`rounded-lg border p-3 text-sm ${status === 'ready' ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300' : 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300'}`}>
      {status === 'ready'
        ? 'Mock exam configuration ready - domain allocation derived from the question bank.'
        : 'Mock exam configuration needs attention - add domain tags to the mock question bank, or set the allocation under Mock Exam Settings.'}
    </div>
  );
}

function PackageList({ packages, onChanged }: { packages: PackageAdminRow[]; onChanged: () => void }) {
  const pushToast = useUiStore((s) => s.pushToast);
  const act = (fn: () => Promise<unknown>, msg: string) =>
    fn().then(() => { pushToast(msg, 'success'); onChanged(); }).catch((e) => pushToast(cleanError(e, 'Action failed'), 'error'));

  if (packages.length === 0) return null;
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-bold uppercase tracking-wide text-ink-faint">Saved packages</h4>
      {[...packages].sort((a, b) => a.displayOrder - b.displayOrder).map((pkg) => (
        <div key={pkg.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-surface-border bg-surface-raised p-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-ink">{pkg.name}</span>
              {pkg.isRecommended && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-ink">Recommended</span>}
              <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${pkg.status === 'published' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-neutral-500/15 text-ink-faint'}`}>{pkg.status}</span>
            </div>
            <div className="mt-1 text-xs text-ink-faint">
              {pkg.isFree ? 'Free' : formatMoney(pkg.sellingPrice, pkg.currency)}
              {pkg.regularPrice > pkg.sellingPrice && ` (was ${formatMoney(pkg.regularPrice, pkg.currency)})`}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {pkg.status === 'published' ? (
              <button type="button" onClick={() => act(() => contentAdminApi.unpublishPackage(pkg.id), 'Package unpublished')} className="rounded-lg border border-surface-border px-3 py-1.5 text-ink-muted hover:border-brand-400">Unpublish</button>
            ) : pkg.status === 'archived' ? (
              <button type="button" onClick={() => act(() => contentAdminApi.restorePackage(pkg.id), 'Package restored')} className="rounded-lg border border-surface-border px-3 py-1.5 text-ink-muted hover:border-brand-400">Restore</button>
            ) : (
              <button type="button" onClick={() => act(() => contentAdminApi.publishPackage(pkg.id), 'Package published')} className="rounded-lg bg-brand-500 px-3 py-1.5 text-white hover:bg-brand-600">Publish</button>
            )}
            {pkg.status !== 'archived' && (
              <button type="button" onClick={() => act(() => contentAdminApi.archivePackage(pkg.id), 'Package archived')} className="rounded-lg border border-surface-border px-3 py-1.5 text-ink-muted hover:border-danger hover:text-danger">Archive</button>
            )}
            {pkg.status === 'draft' && (
              <button type="button" onClick={async () => { if (await confirmDialog({ title: `Delete "${pkg.name}"?` })) act(() => contentAdminApi.deletePackage(pkg.id), 'Package deleted'); }} className="rounded-lg border border-surface-border px-3 py-1.5 text-ink-muted hover:border-danger hover:text-danger">Delete</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 - Review & Publish
// ---------------------------------------------------------------------------

function StepReview({
  certification,
  packages,
  onChanged,
  onBack,
}: {
  certification: CertificationAdminRow;
  packages: PackageAdminRow[];
  onChanged: () => void;
  onBack?: () => void;
}) {
  const pushToast = useUiStore((s) => s.pushToast);
  const [scheduledFor, setScheduledFor] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const now = new Date();

  const { data: practiceDomains } = useQuery({
    queryKey: ['admin', 'bankDomainCounts', 'practiceTest', certification.practiceBankId],
    queryFn: () => contentAdminApi.getBankDomainCounts('practiceTest', certification.practiceBankId!),
    enabled: !!certification.practiceBankId,
  });
  const eligibleQuestions = practiceDomains?.totalQuestions ?? null;

  const sorted = [...packages].filter((p) => p.status !== 'archived').sort((a, b) => a.displayOrder - b.displayOrder);
  const recommended = sorted.find((p) => p.isRecommended) ?? sorted[0] ?? null;

  const blockers: string[] = [];
  const hasPracticeContent =
    !!certification.practiceBankId || !!certification.seriesId || (certification.practiceBankIds?.length ?? 0) > 0;
  if (!hasPracticeContent) blockers.push('Link a question bank or generate batches from an uploaded document.');
  for (const p of sorted) {
    const t = detectTemplate(p);
    const label = p.name;
    if (!hasEntitlement(p.includedQuizIds, p.includedPracticeTestIds)) blockers.push(`${label}: connect it to a question bank.`);
    if (!hasPublishablePrice(p.sellingPrice, p.isFree)) blockers.push(`Enter a selling price for ${label}.`);
    if ((t === 'mock' || t === 'complete') && !certification.mockBankId) blockers.push('Select a mock exam question bank.');
    if (eligibleQuestions != null && p.accessibleQuestionCount > eligibleQuestions) {
      blockers.push(`The selected bank contains only ${eligibleQuestions.toLocaleString()} eligible questions. Reduce ${label}'s question count.`);
    }
  }
  if (sorted.length === 0) blockers.push('Add at least one package.');

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!certification.effectiveFrom && !scheduledFor) {
        await contentAdminApi.updateCertification({ certificationId: certification.id, effectiveFrom: new Date().toISOString() });
      }
      await contentAdminApi.publishCertification(certification.id, scheduledFor ? new Date(scheduledFor).toISOString() : null);
      if (!scheduledFor) {
        for (const p of sorted) {
          if (p.status !== 'published') await contentAdminApi.publishPackage(p.id);
        }
      }
    },
    onSuccess: () => { pushToast(scheduledFor ? 'Publication scheduled' : 'Exam preparation and packages published', 'success'); onChanged(); },
    onError: (err) => pushToast(cleanError(err, 'Could not publish'), 'error'),
  });

  const lifecycle = (fn: () => Promise<unknown>, msg: string) =>
    fn().then(() => { pushToast(msg, 'success'); onChanged(); }).catch((e) => pushToast(cleanError(e, 'Action failed'), 'error'));

  const { data: history } = useQuery({
    queryKey: ['admin', 'certAudit', certification.id],
    queryFn: () => contentAdminApi.getAuditHistoryForCertification(certification.id),
    enabled: showHistory,
  });

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-faint">What learners will see</h3>
        <div className="rounded-xl border border-surface-border bg-surface-raised p-5 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-ink-faint">{certification.provider}</div>
          <div className="text-lg font-semibold text-ink">{certification.name}</div>
          <p className="mt-1 text-sm text-ink-faint">{certification.shortDescription || certification.description}</p>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {sorted.map((pkg) => {
              const offer = computeOfferStatus(
                { offerPrice: pkg.offerPrice, offerStart: pkg.offerStart ? toDate(pkg.offerStart) : null, offerEnd: pkg.offerEnd ? toDate(pkg.offerEnd) : null, offerCancelledAt: pkg.offerCancelledAt ? toDate(pkg.offerCancelledAt) : null },
                now,
              );
              const price = offer === 'active' ? pkg.offerPrice! : pkg.sellingPrice;
              return (
                <div key={pkg.id} className={`rounded-lg border p-3 text-sm ${pkg.id === recommended?.id ? 'border-brand-500 bg-brand-50' : 'border-surface-border'}`}>
                  <div className="font-semibold text-ink">
                    {pkg.name}
                    {pkg.id === recommended?.id && <span className="ml-1 rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-bold uppercase text-white">Recommended</span>}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    {pkg.regularPrice > price && <span className="text-xs text-ink-faint line-through">{formatMoney(pkg.regularPrice, pkg.currency)}</span>}
                    <span className="font-bold text-ink">{pkg.isFree ? 'Free' : formatMoney(price, pkg.currency)}</span>
                  </div>
                  <ul className="mt-2 space-y-0.5 text-xs text-ink-muted">
                    {visibleBenefits(pkg.includedFeatures).map((f) => <li key={f}>• {f}</li>)}
                  </ul>
                  <div className="mt-2 text-xs text-ink-faint">
                    {pkg.accessValidityDays} days access
                    {pkg.mockAccessEnabled ? ` · ${pkg.fullMockAttempts} mock attempts` : ''}
                    {pkg.practiceAccessEnabled ? ` · ${pkg.accessibleQuestionCount.toLocaleString()} questions` : ''}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-4 border-t border-surface-border pt-3 text-[11px] leading-relaxed text-ink-faint">{certification.independentPrepDisclaimer}</p>
        </div>
      </div>

      {blockers.length > 0 && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-500">
          <div className="mb-1 font-semibold">Fix these before publishing:</div>
          <ul className="list-inside list-disc space-y-0.5">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
        </div>
      )}

      <div className="rounded-xl border border-surface-border bg-surface-raised p-5">
        <div className="mb-4 flex items-center gap-2 text-sm">
          <span className="text-ink-faint">Status:</span>
          <span className="rounded-full bg-brand-50 px-2 py-0.5 font-semibold capitalize text-brand-ink">{certification.status}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {onBack && (
            <button type="button" onClick={onBack} className="rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted">← Back</button>
          )}
          <button
            type="button"
            disabled={blockers.length > 0 || publishMutation.isPending}
            onClick={async () => { if (await confirmDialog({ title: 'Publish this exam preparation and its packages now?' })) publishMutation.mutate(); }}
            className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {publishMutation.isPending ? 'Publishing…' : 'Publish'}
          </button>
        </div>

        <Disclosure label="More actions">
          <div className="space-y-3">
            <Field label="Schedule publication for">
              <div className="flex flex-wrap gap-2">
                <input type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} className="input-dark" />
                <button
                  type="button"
                  disabled={!scheduledFor || blockers.length > 0 || publishMutation.isPending}
                  onClick={() => publishMutation.mutate()}
                  className="rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted disabled:opacity-50"
                >
                  Schedule
                </button>
              </div>
            </Field>
            <div className="flex flex-wrap gap-2">
              {certification.status === 'published' && (
                <button type="button" onClick={() => lifecycle(() => contentAdminApi.unpublishCertification(certification.id), 'Unpublished')} className="rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted">Unpublish</button>
              )}
              {certification.status === 'archived' ? (
                <button type="button" onClick={() => lifecycle(() => contentAdminApi.restoreCertification(certification.id), 'Restored to Draft')} className="rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted">Restore</button>
              ) : (
                <button type="button" onClick={async () => { if (await confirmDialog({ title: 'Archive this exam preparation?' })) lifecycle(() => contentAdminApi.archiveCertification(certification.id), 'Archived'); }} className="rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted hover:border-danger hover:text-danger">Archive</button>
              )}
              <button type="button" onClick={() => setShowHistory((v) => !v)} className="rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted">{showHistory ? 'Hide' : 'View'} history</button>
            </div>
            {showHistory && (
              <div className="space-y-2">
                {(history?.entries ?? []).length === 0 && <p className="text-sm text-ink-faint">No audit history yet.</p>}
                {(history?.entries ?? []).map((entry: AuditLogEntry) => (
                  <div key={entry.id} className="rounded-lg border border-surface-border p-3 text-xs">
                    <div className="font-medium text-ink">{entry.description}</div>
                    <div className="text-ink-faint">{toDate(entry.createdAt).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Disclosure>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit-view sections
// ---------------------------------------------------------------------------

function MockConfigSection({ certification, onChanged }: { certification: CertificationAdminRow; onChanged: () => void }) {
  if (certification.contentVersions.length === 0) {
    return (
      <p className="text-sm text-ink-faint">
        Set a mock exam question bank in Product Details to enable mock configuration. Domain allocation is then
        derived from that bank automatically.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-faint">
        Mock rules are derived from the question bank. Use the controls below only to override the domain allocation,
        timing or release behaviour.
      </p>
      <Disclosure label="Mock Exam Settings">
        <StepMockRules certificationId={certification.id} certification={certification} onChanged={onChanged} />
      </Disclosure>
    </div>
  );
}

function CertificateInfo({ certification }: { certification: CertificationAdminRow }) {
  return (
    <div className="text-sm text-ink-faint">
      <p>
        Completion certificates are issued automatically by the linked question bank(s) when a learner finishes a
        mock exam. There is no separate certificate setting to configure here.
      </p>
      <div className="mt-3 flex gap-2">
        <Link to="/admin/quizzes" className="rounded-lg border border-surface-border px-3 py-1.5 text-xs text-ink-muted hover:border-brand-400">Mock exam banks</Link>
        <Link to="/admin/practice-tests" className="rounded-lg border border-surface-border px-3 py-1.5 text-xs text-ink-muted hover:border-brand-400">Practice banks</Link>
      </div>
      <p className="mt-3 text-xs">Learners view earned certificates on their My Certificates page; anyone can verify one at /verify/&lt;id&gt;.</p>
      <p className="mt-2 text-xs">Disclaimer applied to this product: “{certification.independentPrepDisclaimer}”</p>
    </div>
  );
}

function AdvancedActions({ certification, onChanged }: { certification: CertificationAdminRow; onChanged: () => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-faint">
        Slug, category, display order, effective dates, disclaimer and the raw content-version list are edited in the
        Product Details section’s Advanced Settings. Publication lifecycle and audit history are in Review &amp; Publish.
      </p>
      <ContentVersionsPanel certification={certification} onDirty={onChanged} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Content Versions (raw) - kept for multi-outline certifications
// ---------------------------------------------------------------------------

function ContentVersionsPanel({ certification, onDirty }: { certification: CertificationAdminRow; onDirty: () => void }) {
  const pushToast = useUiStore((s) => s.pushToast);
  const queryClient = useQueryClient();
  const { data: quizzes } = useQuery({ queryKey: ['admin', 'quizzes'], queryFn: contentAdminApi.listQuizzesAdmin });
  const { data: tests } = useQuery({ queryKey: ['admin', 'practiceTests'], queryFn: contentAdminApi.listPracticeTestsAdmin });

  const [versionName, setVersionName] = useState('');
  const [versionCode, setVersionCode] = useState('');
  const [bankType, setBankType] = useState<'quiz' | 'practiceTest'>('quiz');
  const [bankId, setBankId] = useState('');
  const [effFrom, setEffFrom] = useState('');
  const [effTo, setEffTo] = useState('');
  const [notes, setNotes] = useState('');

  const banks = bankType === 'quiz' ? quizzes?.quizzes ?? [] : tests?.practiceTests ?? [];

  const saveMutation = useMutation({
    mutationFn: () =>
      contentAdminApi.saveContentVersion(certification.id, {
        versionName,
        versionCode,
        associatedBankType: bankType,
        associatedBankId: bankId,
        effectiveFrom: new Date(effFrom).toISOString(),
        effectiveTo: effTo ? new Date(effTo).toISOString() : null,
        status: 'active',
        notes,
      }),
    onSuccess: () => {
      pushToast('Content version saved', 'success');
      setVersionName(''); setVersionCode(''); setBankId(''); setEffFrom(''); setEffTo(''); setNotes('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'certifications'] });
      onDirty();
    },
    onError: (err) => pushToast(cleanError(err, 'Could not save content version'), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (versionId: string) => contentAdminApi.deleteContentVersion(certification.id, versionId),
    onSuccess: () => {
      pushToast('Content version removed', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'certifications'] });
    },
    onError: (err) => pushToast(cleanError(err, 'Could not remove content version'), 'error'),
  });

  return (
    <div className="rounded-xl border border-surface-border bg-surface p-5">
      <h3 className="mb-3 font-medium text-ink">Content Versions (advanced)</h3>
      {certification.contentVersions.length === 0 ? (
        <p className="mb-4 text-sm text-ink-faint">None yet. One is created automatically when you set a mock exam question bank.</p>
      ) : (
        <div className="mb-4 space-y-2">
          {certification.contentVersions.map((v) => (
            <div key={v.id} className="flex items-center justify-between rounded-lg border border-surface-border p-3 text-sm">
              <div>
                <span className="font-medium text-ink">{v.versionName}</span>{' '}
                <span className="text-ink-faint">
                  ({v.versionCode}) · {v.associatedBankType === 'quiz' ? 'Mock Exam' : 'Practice Test'} bank · effective {toDate(v.effectiveFrom).toLocaleDateString()}
                  {v.effectiveTo ? ` - ${toDate(v.effectiveTo).toLocaleDateString()}` : ' onward'}
                </span>
              </div>
              <button type="button" onClick={() => deleteMutation.mutate(v.id)} className="rounded-md border border-red-200 px-2 py-0.5 text-xs font-semibold text-red-500 hover:bg-red-50 dark:border-red-500/30 dark:hover:bg-red-500/10">Remove</button>
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        <Field label="Version name"><input value={versionName} onChange={(e) => setVersionName(e.target.value)} className="input-dark" /></Field>
        <Field label="Version code"><input value={versionCode} onChange={(e) => setVersionCode(e.target.value)} className="input-dark" /></Field>
        <Field label="Bank type">
          <select value={bankType} onChange={(e) => { setBankType(e.target.value as 'quiz' | 'practiceTest'); setBankId(''); }} className="input-dark">
            <option value="quiz">Mock Exam (quiz) bank</option>
            <option value="practiceTest">Practice Test bank</option>
          </select>
        </Field>
        <Field label="Question bank">
          <select value={bankId} onChange={(e) => setBankId(e.target.value)} className="input-dark">
            <option value="">Select…</option>
            {banks.map((b) => <option key={b.id} value={b.id}>{b.title} ({b.totalQuestions} questions)</option>)}
          </select>
        </Field>
        <Field label="Effective from"><input type="datetime-local" value={effFrom} onChange={(e) => setEffFrom(e.target.value)} className="input-dark" /></Field>
        <Field label="Effective to (optional)"><input type="datetime-local" value={effTo} onChange={(e) => setEffTo(e.target.value)} className="input-dark" /></Field>
      </div>
      <Field label="Notes"><input value={notes} onChange={(e) => setNotes(e.target.value)} className="input-dark mt-3" /></Field>
      <button
        type="button"
        disabled={!versionName.trim() || !versionCode.trim() || !bankId || !effFrom || saveMutation.isPending}
        onClick={() => saveMutation.mutate()}
        className="mt-3 rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted hover:border-brand-400 disabled:opacity-50"
      >
        {saveMutation.isPending ? 'Saving…' : '+ Add Content Version'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mock Rules (raw) - reused verbatim under "Customize Mock Rules"
// ---------------------------------------------------------------------------

function StepMockRules({
  certificationId,
  certification,
  onChanged,
}: {
  certificationId: string;
  certification: CertificationAdminRow;
  onChanged: () => void;
}) {
  const pushToast = useUiStore((s) => s.pushToast);
  const queryClient = useQueryClient();
  const [selectedVersionId, setSelectedVersionId] = useState(certification.contentVersions[0]?.id ?? '');
  const existingBlueprint = certification.mockBlueprints.find((b) => b.contentVersionId === selectedVersionId) ?? null;

  const [totalQuestions, setTotalQuestions] = useState(String(existingBlueprint?.totalQuestions ?? 150));
  const [durationMinutes, setDurationMinutes] = useState(String(existingBlueprint?.durationMinutes ?? 240));
  const [domains, setDomains] = useState<DomainAllocation[]>(existingBlueprint?.domains ?? []);
  const [repeatPolicy, setRepeatPolicy] = useState(existingBlueprint?.repeatPolicy ?? 'minimize_repeats');
  const [explanationRelease, setExplanationRelease] = useState(existingBlueprint?.explanationRelease ?? 'after_submission');
  const [autoSubmit, setAutoSubmit] = useState(existingBlueprint?.autoSubmit ?? true);
  const [allowPauseResume, setAllowPauseResume] = useState(existingBlueprint?.allowPauseResume ?? true);
  const [shuffleOptions, setShuffleOptions] = useState(existingBlueprint?.shuffleOptions ?? true);
  const [readinessThreshold, setReadinessThreshold] = useState(
    existingBlueprint?.readinessThresholdPercent != null ? String(existingBlueprint?.readinessThresholdPercent) : '',
  );

  const version = certification.contentVersions.find((v) => v.id === selectedVersionId) ?? null;
  const { data: domainCounts } = useQuery({
    queryKey: ['admin', 'bankDomainCounts', version?.associatedBankType, version?.associatedBankId],
    queryFn: () => contentAdminApi.getBankDomainCounts(version!.associatedBankType, version!.associatedBankId),
    enabled: !!version,
  });

  const validation = useMemo(
    () =>
      validateMockBlueprint({
        domains,
        totalQuestions: Number(totalQuestions) || 0,
        durationMinutes: Number(durationMinutes) || 0,
        difficultyDistribution: null,
        eligibleCountByDomain: domainCounts?.byDomain ?? {},
      }),
    [domains, totalQuestions, durationMinutes, domainCounts],
  );

  const autofill = () => {
    if (!domainCounts) return;
    const d = deriveMockBlueprint({ byDomain: domainCounts.byDomain, totalQuestions: Number(totalQuestions) || 0, durationMinutes: Number(durationMinutes) || 0 });
    setDomains(d.domains);
  };
  const updateDomainRow = (i: number, patch: Partial<DomainAllocation>) =>
    setDomains((d) => d.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const removeDomainRow = (i: number) => setDomains((d) => d.filter((_, idx) => idx !== i));

  const saveMutation = useMutation({
    mutationFn: () =>
      contentAdminApi.saveMockBlueprint(certificationId, {
        id: existingBlueprint?.id,
        contentVersionId: selectedVersionId,
        totalQuestions: Number(totalQuestions) || 0,
        durationMinutes: Number(durationMinutes) || 0,
        domains,
        difficultyDistribution: null,
        repeatPolicy,
        shuffleOptions,
        explanationRelease,
        allowPauseResume,
        autoSubmit,
        readinessThresholdPercent: readinessThreshold ? Number(readinessThreshold) : null,
        status: 'active',
      }),
    onSuccess: () => {
      pushToast('Mock Rules saved', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'certifications'] });
      onChanged();
    },
    onError: (err) => pushToast(cleanError(err, 'Could not save Mock Rules'), 'error'),
  });

  if (certification.contentVersions.length === 0) {
    return <p className="text-sm text-ink-faint">Set a mock exam question bank in Product Details first.</p>;
  }

  return (
    <div className="space-y-5">
      {certification.contentVersions.length > 1 && (
        <Field label="Outline version">
          <select value={selectedVersionId} onChange={(e) => setSelectedVersionId(e.target.value)} className="input-dark">
            {certification.contentVersions.map((v) => <option key={v.id} value={v.id}>{v.versionName}</option>)}
          </select>
        </Field>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Total questions per mock"><input type="number" min={1} value={totalQuestions} onChange={(e) => setTotalQuestions(e.target.value)} className="input-dark" /></Field>
        <Field label="Duration (minutes)"><input type="number" min={1} value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} className="input-dark" /></Field>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wide text-ink-faint">Domain allocation</h4>
          <button type="button" onClick={autofill} className="text-xs font-medium text-brand-ink hover:underline">Auto-fill from question bank</button>
        </div>
        <div className="space-y-2">
          {domains.map((d, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
              <input value={d.domain} onChange={(e) => updateDomainRow(i, { domain: e.target.value })} placeholder="Domain name" className="input-dark" />
              <input type="number" value={d.percent} onChange={(e) => updateDomainRow(i, { percent: Number(e.target.value) })} placeholder="%" className="input-dark" />
              <input type="number" value={d.questionCount} onChange={(e) => updateDomainRow(i, { questionCount: Number(e.target.value) })} placeholder="Questions" className="input-dark" />
              <div className="flex items-center text-xs text-ink-faint">{domainCounts ? `${domainCounts.byDomain[d.domain] ?? 0} eligible` : 'N/A'}</div>
              <button type="button" onClick={() => removeDomainRow(i)} className="rounded-md border border-red-200 px-2 py-0.5 text-xs font-semibold text-red-500 hover:bg-red-50 dark:border-red-500/30 dark:hover:bg-red-500/10">Remove</button>
            </div>
          ))}
          {domains.length === 0 && <p className="text-xs text-ink-faint">No domains yet. Use “Auto-fill from question bank”.</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        <Field label="Question-repeat policy">
          <select value={repeatPolicy} onChange={(e) => setRepeatPolicy(e.target.value as typeof repeatPolicy)} className="input-dark">
            <option value="minimize_repeats">Prioritise unseen, minimize repeats</option>
            <option value="allow_repeats">Allow repeats</option>
          </select>
        </Field>
        <Field label="Explanation release">
          <select value={explanationRelease} onChange={(e) => setExplanationRelease(e.target.value as typeof explanationRelease)} className="input-dark">
            <option value="after_submission">After submission</option>
            <option value="immediate">Immediate</option>
            <option value="never">Never</option>
          </select>
        </Field>
        <Field label="Readiness threshold (%, optional)">
          <input type="number" min={0} max={100} value={readinessThreshold} onChange={(e) => setReadinessThreshold(e.target.value)} className="input-dark" />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ToggleField label="Shuffle answer options" checked={shuffleOptions} onChange={setShuffleOptions} />
        <ToggleField label="Allow pause/resume" checked={allowPauseResume} onChange={setAllowPauseResume} />
        <ToggleField label="Auto-submit at time limit" checked={autoSubmit} onChange={setAutoSubmit} />
      </div>

      {!validation.valid && domains.length > 0 && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-500">
          <ul className="list-inside list-disc space-y-0.5">{validation.errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}

      <button
        type="button"
        disabled={!validation.valid || saveMutation.isPending || domains.length === 0}
        onClick={() => saveMutation.mutate()}
        className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {saveMutation.isPending ? 'Saving…' : 'Save Mock Rules'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom package form (raw) - the full entitlement/pricing form, kept as an
// escape hatch so nothing the old editor could do is lost.
// ---------------------------------------------------------------------------

const EMPTY_CUSTOM = {
  packageType: 'custom',
  name: '',
  shortDescription: '',
  badgeText: '',
  isRecommended: false,
  description: '',
  includedFeatures: '',
  includedQuizIds: [] as string[],
  includedPracticeTestIds: [] as string[],
  practiceAccessEnabled: false,
  accessibleQuestionCount: '0',
  explanationAccessEnabled: false,
  mockAccessEnabled: false,
  fullMockAttempts: '0',
  miniMockAttempts: '0',
  questionsPerMock: '0',
  mockDurationMinutes: '0',
  studyPlanAccessEnabled: false,
  analyticsAccessEnabled: false,
  trialAvailable: false,
  accessValidityDays: '180',
  renewalAvailable: false,
  upgradeAvailable: false,
  promoEligible: true,
  referralEligible: true,
  refundEligible: true,
  currency: 'INR' as 'INR' | 'USD',
  regularPrice: '',
  sellingPrice: '',
  offerPrice: '',
  offerStart: '',
  offerEnd: '',
  renewalPrice: '',
  taxTreatment: 'inclusive' as 'inclusive' | 'exclusive' | 'exempt',
  isFree: false,
  displayOrder: '0',
};

function CustomPackageForm({ certificationId, onChanged }: { certificationId: string; onChanged: () => void }) {
  const pushToast = useUiStore((s) => s.pushToast);
  const { data: quizzes } = useQuery({ queryKey: ['admin', 'quizzes'], queryFn: contentAdminApi.listQuizzesAdmin });
  const { data: tests } = useQuery({ queryKey: ['admin', 'practiceTests'], queryFn: contentAdminApi.listPracticeTestsAdmin });
  const [form, setForm] = useState(EMPTY_CUSTOM);
  const set = <K extends keyof typeof EMPTY_CUSTOM>(key: K, value: (typeof EMPTY_CUSTOM)[K]) => setForm((f) => ({ ...f, [key]: value }));

  const buildPayload = () => ({
    certificationId,
    name: form.name.trim(),
    badgeText: form.badgeText.trim() || null,
    isRecommended: form.isRecommended,
    description: form.description,
    includedQuizIds: form.includedQuizIds,
    includedPracticeTestIds: form.includedPracticeTestIds,
    displayOrder: Number(form.displayOrder) || 0,
    packageType: form.packageType,
    shortDescription: form.shortDescription,
    includedFeatures: form.includedFeatures.split('\n').map((s) => s.trim()).filter(Boolean),
    practiceAccessEnabled: form.practiceAccessEnabled,
    accessibleQuestionCount: Number(form.accessibleQuestionCount) || 0,
    explanationAccessEnabled: form.explanationAccessEnabled,
    mockAccessEnabled: form.mockAccessEnabled,
    fullMockAttempts: Number(form.fullMockAttempts) || 0,
    miniMockAttempts: Number(form.miniMockAttempts) || 0,
    questionsPerMock: Number(form.questionsPerMock) || 0,
    mockDurationMinutes: Number(form.mockDurationMinutes) || 0,
    studyPlanAccessEnabled: form.studyPlanAccessEnabled,
    analyticsAccessEnabled: form.analyticsAccessEnabled,
    trialAvailable: form.trialAvailable,
    accessValidityDays: Number(form.accessValidityDays) || 180,
    renewalAvailable: form.renewalAvailable,
    upgradeAvailable: form.upgradeAvailable,
    promoEligible: form.promoEligible,
    referralEligible: form.referralEligible,
    refundEligible: form.refundEligible,
    regularPrice: majorToMinor(Number(form.regularPrice) || 0),
    sellingPrice: majorToMinor(Number(form.sellingPrice) || 0),
    offerPrice: form.offerPrice ? majorToMinor(Number(form.offerPrice)) : null,
    offerStart: form.offerStart ? new Date(form.offerStart).toISOString() : null,
    offerEnd: form.offerEnd ? new Date(form.offerEnd).toISOString() : null,
    renewalPrice: form.renewalPrice ? majorToMinor(Number(form.renewalPrice)) : null,
    taxTreatment: form.taxTreatment,
    isFree: form.isFree,
    currency: form.currency,
  });

  const saveMutation = useMutation({
    mutationFn: () => contentAdminApi.createPackage(buildPayload()),
    onSuccess: () => { pushToast('Package created', 'success'); setForm(EMPTY_CUSTOM); onChanged(); },
    onError: (err) => pushToast(cleanError(err, 'Could not save the package'), 'error'),
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        <Field label="Package type"><input value={form.packageType} onChange={(e) => set('packageType', e.target.value)} className="input-dark" /></Field>
        <Field label="Display name"><input value={form.name} onChange={(e) => set('name', e.target.value)} className="input-dark" /></Field>
        <Field label="Badge text (optional)"><input value={form.badgeText} onChange={(e) => set('badgeText', e.target.value)} className="input-dark" /></Field>
      </div>
      <Field label="Short description"><input value={form.shortDescription} onChange={(e) => set('shortDescription', e.target.value)} className="input-dark" /></Field>
      <Field label="Included features (one per line)"><textarea value={form.includedFeatures} onChange={(e) => set('includedFeatures', e.target.value)} rows={3} className="input-dark" /></Field>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={form.isRecommended} onChange={(e) => set('isRecommended', e.target.checked)} className="h-4 w-4" /> Recommended package
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Mock Exam banks (quizzes)">
          <select multiple value={form.includedQuizIds} onChange={(e) => set('includedQuizIds', Array.from(e.target.selectedOptions, (o) => o.value))} className="input-dark h-28">
            {(quizzes?.quizzes ?? []).map((q) => <option key={q.id} value={q.id}>{q.title}</option>)}
          </select>
        </Field>
        <Field label="Practice Test banks">
          <select multiple value={form.includedPracticeTestIds} onChange={(e) => set('includedPracticeTestIds', Array.from(e.target.selectedOptions, (o) => o.value))} className="input-dark h-28">
            {(tests?.practiceTests ?? []).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ToggleField label="Practice access" checked={form.practiceAccessEnabled} onChange={(v) => set('practiceAccessEnabled', v)} />
        <Field label="Accessible questions"><input type="number" min={0} value={form.accessibleQuestionCount} onChange={(e) => set('accessibleQuestionCount', e.target.value)} className="input-dark" /></Field>
        <ToggleField label="Explanations" checked={form.explanationAccessEnabled} onChange={(v) => set('explanationAccessEnabled', v)} />
        <ToggleField label="Study plan" checked={form.studyPlanAccessEnabled} onChange={(v) => set('studyPlanAccessEnabled', v)} />
        <ToggleField label="Analytics" checked={form.analyticsAccessEnabled} onChange={(v) => set('analyticsAccessEnabled', v)} />
        <ToggleField label="Mock access" checked={form.mockAccessEnabled} onChange={(v) => set('mockAccessEnabled', v)} />
        <Field label="Full mock attempts"><input type="number" min={0} value={form.fullMockAttempts} onChange={(e) => set('fullMockAttempts', e.target.value)} className="input-dark" /></Field>
        <Field label="Mini-mock attempts"><input type="number" min={0} value={form.miniMockAttempts} onChange={(e) => set('miniMockAttempts', e.target.value)} className="input-dark" /></Field>
        <Field label="Questions per mock"><input type="number" min={0} value={form.questionsPerMock} onChange={(e) => set('questionsPerMock', e.target.value)} className="input-dark" /></Field>
        <Field label="Mock duration (minutes)"><input type="number" min={0} value={form.mockDurationMinutes} onChange={(e) => set('mockDurationMinutes', e.target.value)} className="input-dark" /></Field>
        <Field label="Access validity (days)"><input type="number" min={1} value={form.accessValidityDays} onChange={(e) => set('accessValidityDays', e.target.value)} className="input-dark" /></Field>
        <ToggleField label="Trial available" checked={form.trialAvailable} onChange={(v) => set('trialAvailable', v)} />
        <ToggleField label="Renewal available" checked={form.renewalAvailable} onChange={(v) => set('renewalAvailable', v)} />
        <ToggleField label="Upgrade available" checked={form.upgradeAvailable} onChange={(v) => set('upgradeAvailable', v)} />
        <ToggleField label="Promo-code eligible" checked={form.promoEligible} onChange={(v) => set('promoEligible', v)} />
        <ToggleField label="Referral eligible" checked={form.referralEligible} onChange={(v) => set('referralEligible', v)} />
        <ToggleField label="Refund eligible" checked={form.refundEligible} onChange={(v) => set('refundEligible', v)} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Currency">
          <select value={form.currency} onChange={(e) => set('currency', e.target.value as 'INR' | 'USD')} className="input-dark">
            <option value="INR">INR</option><option value="USD">USD</option>
          </select>
        </Field>
        <Field label="Regular price (₹)"><input type="number" min={0} value={form.regularPrice} onChange={(e) => set('regularPrice', e.target.value)} className="input-dark" /></Field>
        <Field label="Selling price (₹)"><input type="number" min={0} value={form.sellingPrice} onChange={(e) => set('sellingPrice', e.target.value)} className="input-dark" /></Field>
        <Field label="Renewal price (₹, optional)"><input type="number" min={0} value={form.renewalPrice} onChange={(e) => set('renewalPrice', e.target.value)} className="input-dark" /></Field>
        <Field label="Offer price (₹, optional)"><input type="number" min={0} value={form.offerPrice} onChange={(e) => set('offerPrice', e.target.value)} className="input-dark" /></Field>
        <Field label="Offer start"><input type="datetime-local" value={form.offerStart} onChange={(e) => set('offerStart', e.target.value)} className="input-dark" /></Field>
        <Field label="Offer end"><input type="datetime-local" value={form.offerEnd} onChange={(e) => set('offerEnd', e.target.value)} className="input-dark" /></Field>
        <Field label="Tax treatment">
          <select value={form.taxTreatment} onChange={(e) => set('taxTreatment', e.target.value as 'inclusive' | 'exclusive' | 'exempt')} className="input-dark">
            <option value="inclusive">Tax-inclusive</option><option value="exclusive">Tax-exclusive</option><option value="exempt">Tax-exempt</option>
          </select>
        </Field>
        <ToggleField label="Free package" checked={form.isFree} onChange={(v) => set('isFree', v)} />
        <Field label="Display order"><input type="number" min={0} value={form.displayOrder} onChange={(e) => set('displayOrder', e.target.value)} className="input-dark" /></Field>
      </div>

      <button
        type="button"
        disabled={!form.name.trim() || saveMutation.isPending}
        onClick={() => saveMutation.mutate()}
        className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {saveMutation.isPending ? 'Saving…' : 'Add custom package'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------

// Backend errors are worded for developers ("associatedBankId does not
// reference…"); surface something an admin can act on. The generic status /
// validation handling lives in friendlyApiError; this only adds the
// domain-specific rewrites for this screen.
function cleanError(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : '';
  if (/slug/i.test(msg)) return 'That web address is already taken by another product - change the short name or set a different slug in Advanced Settings.';
  if (/unpublished certification cannot expose/i.test(msg)) return 'Publish the exam preparation before publishing its packages.';
  if (/no included quiz\/practice test|at least one quiz or practice test|valid entitlement/i.test(msg)) return 'Connect this package to a question bank first.';
  if (/selling price/i.test(msg)) return 'Enter a selling price greater than zero, or mark the package Free.';
  if (/accessible question count|eligible/i.test(msg)) return msg.replace(/^[a-z]+: /i, '');
  if (/domain/i.test(msg)) return 'Mock domain allocation needs attention - open Mock Exam Settings.';
  return friendlyApiError(err, fallback);
}
