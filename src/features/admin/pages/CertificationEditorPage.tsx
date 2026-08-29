import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  contentAdminApi,
  type CertificationAdminRow,
  type PackageAdminRow,
  type AuditLogEntry,
} from '../api/contentAdminApi';
import { useUiStore } from '@/store/useUiStore';
import { toDate } from '@/utils/formatDate';
import { formatMoney, majorToMinor, minorToMajor } from '@/utils/currency';
import { CategorySelect } from '@/components/common/CategorySelect';
import { validateMockBlueprint } from '../lib/mockBlueprintValidation';
import {
  hasPublishablePrice,
  hasEntitlement,
  isOfferPriceValid,
  isOfferWindowValid,
  isValidityDaysValid,
} from '../lib/packageValidation';
import { computeOfferStatus } from '../lib/offerStatus';
import type { CertificationIconKey, DomainAllocation } from '@/types/models';

type Step = 1 | 2 | 3 | 4;
const STEP_LABELS: Record<Step, string> = { 1: 'Certification', 2: 'Packages & Prices', 3: 'Mock Rules', 4: 'Preview & Publish' };
const ICON_OPTIONS: CertificationIconKey[] = ['shield', 'cloud', 'network', 'chart', 'generic'];

function toInputDateTime(v: unknown): string {
  if (!v) return '';
  const d = toDate(v);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// The four-step Add/Edit Certification workflow (Certification -> Packages
// & Prices -> Mock Rules -> Preview & Publish). Each step's "Save Draft"
// persists immediately (this certification stays status:'draft' until the
// admin explicitly publishes), so moving between steps never loses data —
// Preview & Publish reads back whatever was most recently saved, which is
// exactly the current draft, not a separately-tracked in-memory diff.
export function CertificationEditorPage() {
  const params = useParams<{ certificationId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);

  const isNew = !params.certificationId;
  const [certificationId, setCertificationId] = useState<string | null>(params.certificationId ?? null);
  const [step, setStep] = useState<Step>(searchParams.get('preview') ? 4 : 1);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const { data: certData } = useQuery({
    queryKey: ['admin', 'certifications'],
    queryFn: contentAdminApi.listCertificationsAdmin,
  });
  const certification = certificationId ? certData?.certifications.find((c) => c.id === certificationId) ?? null : null;

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

  const cancelSafely = () => {
    if (dirty && !window.confirm('You have unsaved changes. Leave without saving?')) return;
    navigate('/admin/products');
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">{isNew ? 'Add Certification' : certification?.name ?? 'Edit Certification'}</h1>
        <button type="button" onClick={cancelSafely} className="text-sm text-ink-faint hover:text-ink">
          Cancel
        </button>
      </div>
      <p className="mb-6 text-sm text-ink-faint">
        {certification ? `Status: ${certification.status}` : 'Start by naming the certification and connecting a question bank.'}
      </p>

      <div className="mb-6 flex flex-wrap gap-1 border-b border-surface-border">
        {([1, 2, 3, 4] as Step[]).map((s) => (
          <button
            key={s}
            type="button"
            disabled={s > 1 && !certificationId}
            onClick={() => setStep(s)}
            className={`border-b-2 px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
              step === s ? 'border-[#155EEF] text-[#155EEF]' : 'border-transparent text-ink-faint hover:text-ink'
            }`}
          >
            {s}. {STEP_LABELS[s]}
          </button>
        ))}
      </div>

      {step === 1 && (
        <StepCertification
          certification={certification}
          onDirty={() => setDirty(true)}
          onSaved={(id) => {
            setCertificationId(id);
            setDirty(false);
            invalidate();
            if (isNew) navigate(`/admin/products/${id}`, { replace: true });
            pushToast('Draft saved', 'success');
          }}
        />
      )}
      {step === 2 && certificationId && (
        <StepPackages
          certificationId={certificationId}
          packages={packages}
          onChanged={() => {
            invalidate();
            setDirty(false);
          }}
        />
      )}
      {step === 3 && certificationId && certification && (
        <StepMockRules
          certificationId={certificationId}
          certification={certification}
          onChanged={() => {
            invalidate();
            setDirty(false);
          }}
        />
      )}
      {step === 4 && certificationId && certification && (
        <StepPreviewPublish certification={certification} packages={packages} onChanged={invalidate} />
      )}
      {step !== 1 && !certificationId && (
        <p className="rounded-xl border border-dashed border-surface-border p-8 text-center text-sm text-ink-faint">
          Save the Certification step first to unlock Packages, Mock Rules and Preview.
        </p>
      )}

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
          disabled={step === 4 || !certificationId}
          onClick={() => setStep((s) => (s + 1) as Step)}
          className="rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted disabled:opacity-40"
        >
          Next →
        </button>
      </div>
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

// ---------------------------------------------------------------------------
// Step 1 — Certification
// ---------------------------------------------------------------------------

function StepCertification({
  certification,
  onDirty,
  onSaved,
}: {
  certification: CertificationAdminRow | null;
  onDirty: () => void;
  onSaved: (id: string) => void;
}) {
  const pushToast = useUiStore((s) => s.pushToast);
  const [shortName, setShortName] = useState(certification?.shortName ?? '');
  const [name, setName] = useState(certification?.name ?? '');
  const [provider, setProvider] = useState(certification?.provider ?? 'Other');
  const [slug, setSlug] = useState(certification?.slug ?? '');
  const [category, setCategory] = useState(certification?.category ?? 'Other');
  const [shortDescription, setShortDescription] = useState(certification?.shortDescription ?? '');
  const [description, setDescription] = useState(certification?.description ?? '');
  const [iconKey, setIconKey] = useState<CertificationIconKey>(certification?.iconKey ?? 'shield');
  const [effectiveFrom, setEffectiveFrom] = useState(toInputDateTime(certification?.effectiveFrom));
  const [effectiveTo, setEffectiveTo] = useState(toInputDateTime(certification?.effectiveTo));
  const [defaultValidityDays, setDefaultValidityDays] = useState(String(certification?.defaultValidityDays ?? 180));
  const [displayOrder, setDisplayOrder] = useState(String(certification?.displayOrder ?? 0));
  const [featured, setFeatured] = useState(certification?.featured ?? false);
  const [disclaimer, setDisclaimer] = useState(
    certification?.independentPrepDisclaimer ?? 'This is independent exam-preparation content and is not affiliated with or endorsed by the certifying body.'
  );

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        shortName: shortName.trim(),
        name: name.trim(),
        provider,
        slug: slug.trim().toLowerCase(),
        category,
        shortDescription,
        description,
        iconKey,
        effectiveFrom: effectiveFrom ? new Date(effectiveFrom).toISOString() : null,
        effectiveTo: effectiveTo ? new Date(effectiveTo).toISOString() : null,
        defaultValidityDays: Number(defaultValidityDays) || 180,
        featured,
        independentPrepDisclaimer: disclaimer,
        displayOrder: Number(displayOrder) || 0,
      };
      return certification
        ? contentAdminApi.updateCertification({ certificationId: certification.id, ...payload }).then(() => ({ certificationId: certification.id }))
        : contentAdminApi.createCertification(payload);
    },
    onSuccess: (result) => onSaved(result.certificationId),
    onError: (err) => pushToast(err instanceof Error ? err.message : 'Could not save the certification', 'error'),
  });

  const canSave = shortName.trim().length > 0 && name.trim().length >= 2 && /^[a-z0-9-]+$/.test(slug.trim().toLowerCase());

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Certification short name" hint="e.g. CISM">
          <input value={shortName} onChange={(e) => { setShortName(e.target.value); onDirty(); }} className="input-dark" />
        </Field>
        <Field label="Certification display name" hint="e.g. CISM Preparation">
          <input value={name} onChange={(e) => { setName(e.target.value); onDirty(); }} className="input-dark" />
        </Field>
        <Field label="Provider">
          <CategorySelect value={provider} onChange={(v) => { setProvider(v); onDirty(); }} />
        </Field>
        <Field label="Slug" hint="Lowercase letters, numbers, hyphens, must be unique">
          <input value={slug} onChange={(e) => { setSlug(e.target.value); onDirty(); }} placeholder="cism-preparation" className="input-dark" />
        </Field>
        <Field label="Category">
          <input value={category} onChange={(e) => { setCategory(e.target.value); onDirty(); }} className="input-dark" />
        </Field>
        <Field label="Icon">
          <select value={iconKey} onChange={(e) => { setIconKey(e.target.value as CertificationIconKey); onDirty(); }} className="input-dark">
            {ICON_OPTIONS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Short description">
        <input value={shortDescription} onChange={(e) => { setShortDescription(e.target.value); onDirty(); }} className="input-dark" />
      </Field>
      <Field label="Full description">
        <textarea value={description} onChange={(e) => { setDescription(e.target.value); onDirty(); }} rows={3} className="input-dark" />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Effective from">
          <input type="datetime-local" value={effectiveFrom} onChange={(e) => { setEffectiveFrom(e.target.value); onDirty(); }} className="input-dark" />
        </Field>
        <Field label="Effective to">
          <input type="datetime-local" value={effectiveTo} onChange={(e) => { setEffectiveTo(e.target.value); onDirty(); }} className="input-dark" />
        </Field>
        <Field label="Default validity (days)" hint="e.g. 180">
          <input type="number" min={1} value={defaultValidityDays} onChange={(e) => { setDefaultValidityDays(e.target.value); onDirty(); }} className="input-dark" />
        </Field>
        <Field label="Display order">
          <input type="number" min={0} value={displayOrder} onChange={(e) => { setDisplayOrder(e.target.value); onDirty(); }} className="input-dark" />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={featured} onChange={(e) => { setFeatured(e.target.checked); onDirty(); }} className="h-4 w-4" />
        Featured
      </label>

      <Field label="Independent-preparation disclaimer">
        <textarea value={disclaimer} onChange={(e) => { setDisclaimer(e.target.value); onDirty(); }} rows={2} className="input-dark" />
      </Field>

      {certification && <ContentVersionsPanel certification={certification} onDirty={onDirty} />}

      <button
        type="button"
        disabled={!canSave || saveMutation.isPending}
        onClick={() => saveMutation.mutate()}
        className="rounded-lg bg-[#155EEF] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {saveMutation.isPending ? 'Saving…' : 'Save Draft'}
      </button>
    </div>
  );
}

function ContentVersionsPanel({ certification, onDirty }: { certification: CertificationAdminRow; onDirty: () => void }) {
  const pushToast = useUiStore((s) => s.pushToast);
  const queryClient = useQueryClient();
  const { data: quizzes } = useQuery({ queryKey: ['admin', 'quizzes'], queryFn: contentAdminApi.listQuizzesAdmin });
  const { data: tests } = useQuery({ queryKey: ['admin', 'practiceTests'], queryFn: contentAdminApi.listPracticeTestsAdmin });

  const [versionName, setVersionName] = useState('');
  const [versionCode, setVersionCode] = useState('');
  const [bankType, setBankType] = useState<'quiz' | 'practiceTest'>('practiceTest');
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
        status: 'draft',
        notes,
      }),
    onSuccess: () => {
      pushToast('Content version saved', 'success');
      setVersionName('');
      setVersionCode('');
      setBankId('');
      setEffFrom('');
      setEffTo('');
      setNotes('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'certifications'] });
      onDirty();
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : 'Could not save content version', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (versionId: string) => contentAdminApi.deleteContentVersion(certification.id, versionId),
    onSuccess: () => {
      pushToast('Content version removed', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'certifications'] });
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : 'Could not remove content version', 'error'),
  });

  return (
    <div className="rounded-xl border border-surface-border bg-surface p-5">
      <h3 className="mb-3 font-medium text-ink">Content Versions</h3>
      {certification.contentVersions.length === 0 ? (
        <p className="mb-4 text-sm text-ink-faint">No content versions yet. Add one below to connect a question bank.</p>
      ) : (
        <div className="mb-4 space-y-2">
          {certification.contentVersions.map((v) => (
            <div key={v.id} className="flex items-center justify-between rounded-lg border border-surface-border p-3 text-sm">
              <div>
                <span className="font-medium text-ink">{v.versionName}</span>{' '}
                <span className="text-ink-faint">
                  ({v.versionCode}) · {v.associatedBankType === 'quiz' ? 'Mock Exam' : 'Practice Test'} bank · effective{' '}
                  {toDate(v.effectiveFrom).toLocaleDateString()}
                  {v.effectiveTo ? ` – ${toDate(v.effectiveTo).toLocaleDateString()}` : ' onward'}
                </span>
              </div>
              <button type="button" onClick={() => deleteMutation.mutate(v.id)} className="text-xs text-red-500 hover:underline">
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Version name">
          <input value={versionName} onChange={(e) => setVersionName(e.target.value)} placeholder="Current CISM outline" className="input-dark" />
        </Field>
        <Field label="Version code">
          <input value={versionCode} onChange={(e) => setVersionCode(e.target.value)} placeholder="cism-2024" className="input-dark" />
        </Field>
        <Field label="Bank type">
          <select value={bankType} onChange={(e) => { setBankType(e.target.value as 'quiz' | 'practiceTest'); setBankId(''); }} className="input-dark">
            <option value="practiceTest">Practice Test bank</option>
            <option value="quiz">Mock Exam (quiz) bank</option>
          </select>
        </Field>
        <Field label="Question bank">
          <select value={bankId} onChange={(e) => setBankId(e.target.value)} className="input-dark">
            <option value="">Select…</option>
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title} ({b.totalQuestions} questions
                {bankType === 'quiz' && !(b as { isPublished?: boolean }).isPublished ? ', unpublished' : ''})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Effective from">
          <input type="datetime-local" value={effFrom} onChange={(e) => setEffFrom(e.target.value)} className="input-dark" />
        </Field>
        <Field label="Effective to (optional)">
          <input type="datetime-local" value={effTo} onChange={(e) => setEffTo(e.target.value)} className="input-dark" />
        </Field>
      </div>
      <Field label="Notes">
        <input value={notes} onChange={(e) => setNotes(e.target.value)} className="input-dark mt-3" />
      </Field>
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
// Step 2 — Packages & Prices
// ---------------------------------------------------------------------------

const EMPTY_PACKAGE_FORM = {
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

function StepPackages({
  certificationId,
  packages,
  onChanged,
}: {
  certificationId: string;
  packages: PackageAdminRow[];
  onChanged: () => void;
}) {
  const pushToast = useUiStore((s) => s.pushToast);
  const { data: quizzes } = useQuery({ queryKey: ['admin', 'quizzes'], queryFn: contentAdminApi.listQuizzesAdmin });
  const { data: tests } = useQuery({ queryKey: ['admin', 'practiceTests'], queryFn: contentAdminApi.listPracticeTestsAdmin });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_PACKAGE_FORM);

  const set = <K extends keyof typeof EMPTY_PACKAGE_FORM>(key: K, value: (typeof EMPTY_PACKAGE_FORM)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const loadForEdit = (pkg: PackageAdminRow) => {
    setEditingId(pkg.id);
    setForm({
      packageType: pkg.packageType,
      name: pkg.name,
      shortDescription: pkg.shortDescription,
      badgeText: pkg.badgeText ?? '',
      isRecommended: pkg.isRecommended,
      description: pkg.description,
      includedFeatures: pkg.includedFeatures.join('\n'),
      includedQuizIds: pkg.includedQuizIds,
      includedPracticeTestIds: pkg.includedPracticeTestIds,
      practiceAccessEnabled: pkg.practiceAccessEnabled,
      accessibleQuestionCount: String(pkg.accessibleQuestionCount),
      explanationAccessEnabled: pkg.explanationAccessEnabled,
      mockAccessEnabled: pkg.mockAccessEnabled,
      fullMockAttempts: String(pkg.fullMockAttempts),
      miniMockAttempts: String(pkg.miniMockAttempts),
      questionsPerMock: String(pkg.questionsPerMock),
      mockDurationMinutes: String(pkg.mockDurationMinutes),
      studyPlanAccessEnabled: pkg.studyPlanAccessEnabled,
      analyticsAccessEnabled: pkg.analyticsAccessEnabled,
      trialAvailable: pkg.trialAvailable,
      accessValidityDays: String(pkg.accessValidityDays),
      renewalAvailable: pkg.renewalAvailable,
      upgradeAvailable: pkg.upgradeAvailable,
      promoEligible: pkg.promoEligible,
      referralEligible: pkg.referralEligible,
      refundEligible: pkg.refundEligible,
      currency: pkg.currency,
      regularPrice: String(minorToMajor(pkg.regularPrice)),
      sellingPrice: String(minorToMajor(pkg.sellingPrice)),
      offerPrice: pkg.offerPrice !== null ? String(minorToMajor(pkg.offerPrice)) : '',
      offerStart: toInputDateTime(pkg.offerStart),
      offerEnd: toInputDateTime(pkg.offerEnd),
      renewalPrice: pkg.renewalPrice !== null ? String(minorToMajor(pkg.renewalPrice)) : '',
      taxTreatment: pkg.taxTreatment,
      isFree: pkg.isFree,
      displayOrder: String(pkg.displayOrder),
    });
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(EMPTY_PACKAGE_FORM);
  };

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

  const clientErrors = useMemo(() => {
    const errors: string[] = [];
    const regularPrice = majorToMinor(Number(form.regularPrice) || 0);
    const sellingPrice = majorToMinor(Number(form.sellingPrice) || 0);
    const offerPrice = form.offerPrice ? majorToMinor(Number(form.offerPrice)) : null;
    if (regularPrice < 0) errors.push('Regular price cannot be negative.');
    if (sellingPrice < 0) errors.push('Selling price cannot be negative.');
    if (!isOfferPriceValid(offerPrice, regularPrice)) errors.push('Offer price cannot be negative or exceed the regular price.');
    if (!isOfferWindowValid(form.offerStart ? new Date(form.offerStart) : null, form.offerEnd ? new Date(form.offerEnd) : null)) {
      errors.push('Offer end must be later than offer start.');
    }
    if (!isValidityDaysValid(Number(form.accessValidityDays) || 0)) errors.push('Validity must be greater than zero.');
    if (!hasEntitlement(form.includedQuizIds, form.includedPracticeTestIds)) errors.push('Include at least one Mock Exam or Practice Test.');
    if (!hasPublishablePrice(sellingPrice, form.isFree)) errors.push('Set a selling price greater than zero, or mark this package Free.');
    return errors;
  }, [form]);

  const saveMutation = useMutation({
    mutationFn: () =>
      editingId
        ? contentAdminApi.updatePackage({ packageId: editingId, ...buildPayload() }).then(() => ({ packageId: editingId }))
        : contentAdminApi.createPackage(buildPayload()),
    onSuccess: () => {
      pushToast(editingId ? 'Package updated' : 'Package created', 'success');
      resetForm();
      onChanged();
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : 'Could not save the package', 'error'),
  });

  const publishMutation = useMutation({
    mutationFn: (id: string) => contentAdminApi.publishPackage(id),
    onSuccess: () => {
      pushToast('Package published', 'success');
      onChanged();
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : 'Could not publish the package', 'error'),
  });
  const unpublishMutation = useMutation({
    mutationFn: (id: string) => contentAdminApi.unpublishPackage(id),
    onSuccess: () => {
      pushToast('Package unpublished', 'success');
      onChanged();
    },
  });
  const archiveMutation = useMutation({
    mutationFn: (id: string) => contentAdminApi.archivePackage(id),
    onSuccess: () => {
      pushToast('Package archived', 'success');
      onChanged();
    },
  });
  const restoreMutation = useMutation({
    mutationFn: (id: string) => contentAdminApi.restorePackage(id),
    onSuccess: () => {
      pushToast('Package restored to Draft', 'success');
      onChanged();
    },
  });
  const duplicateMutation = useMutation({
    mutationFn: (id: string) => contentAdminApi.duplicatePackage(id),
    onSuccess: () => {
      pushToast('Package duplicated as a new draft', 'success');
      onChanged();
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => contentAdminApi.deletePackage(id),
    onSuccess: () => {
      pushToast('Package deleted', 'success');
      onChanged();
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : 'Could not delete the package', 'error'),
  });

  return (
    <div className="space-y-6">
      {packages.length === 0 ? (
        <p className="text-sm text-ink-faint">No packages yet, add one below (Mock Exams, Practice Questions, Complete Preparation, or a custom type).</p>
      ) : (
        <div className="space-y-2">
          {[...packages]
            .sort((a, b) => a.displayOrder - b.displayOrder)
            .map((pkg) => (
              <div key={pkg.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-surface-border bg-surface-raised p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink">{pkg.name}</span>
                    {pkg.isRecommended && <span className="rounded-full bg-[#E8F0FF] px-2 py-0.5 text-xs font-semibold text-[#155EEF]">Recommended</span>}
                    {pkg.badgeText && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">{pkg.badgeText}</span>}
                    <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${pkg.status === 'published' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-neutral-800 text-ink-faint'}`}>
                      {pkg.status}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-ink-faint">
                    {pkg.isFree ? 'Free' : formatMoney(pkg.sellingPrice, pkg.currency)}
                    {pkg.regularPrice > pkg.sellingPrice && ` (was ${formatMoney(pkg.regularPrice, pkg.currency)})`}
                    {' · '}
                    {pkg.practiceAccessEnabled ? `${pkg.accessibleQuestionCount} questions` : ''}
                    {pkg.practiceAccessEnabled && pkg.mockAccessEnabled ? ' · ' : ''}
                    {pkg.mockAccessEnabled ? `${pkg.fullMockAttempts} mock attempts` : ''}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <button type="button" onClick={() => loadForEdit(pkg)} className="rounded-lg border border-surface-border px-3 py-1.5 text-ink-muted hover:border-brand-400">
                    Edit
                  </button>
                  <button type="button" onClick={() => duplicateMutation.mutate(pkg.id)} className="rounded-lg border border-surface-border px-3 py-1.5 text-ink-muted hover:border-brand-400">
                    Duplicate
                  </button>
                  {pkg.status === 'published' ? (
                    <button type="button" onClick={() => unpublishMutation.mutate(pkg.id)} className="rounded-lg border border-surface-border px-3 py-1.5 text-ink-muted hover:border-brand-400">
                      Unpublish
                    </button>
                  ) : pkg.status === 'archived' ? (
                    <button type="button" onClick={() => restoreMutation.mutate(pkg.id)} className="rounded-lg border border-surface-border px-3 py-1.5 text-ink-muted hover:border-brand-400">
                      Restore
                    </button>
                  ) : (
                    <button type="button" onClick={() => publishMutation.mutate(pkg.id)} className="rounded-lg bg-[#155EEF] px-3 py-1.5 text-white hover:bg-[#004EEB]">
                      Publish
                    </button>
                  )}
                  {pkg.status !== 'archived' && (
                    <button type="button" onClick={() => archiveMutation.mutate(pkg.id)} className="rounded-lg border border-surface-border px-3 py-1.5 text-ink-muted hover:border-red-500/50 hover:text-red-400">
                      Archive
                    </button>
                  )}
                  {pkg.status === 'draft' && (
                    <button type="button" onClick={() => window.confirm(`Delete "${pkg.name}"? This cannot be undone.`) && deleteMutation.mutate(pkg.id)} className="rounded-lg border border-surface-border px-3 py-1.5 text-ink-muted hover:border-red-500/50 hover:text-red-400">
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
        </div>
      )}

      <div className="rounded-xl border border-surface-border bg-surface p-5">
        <h3 className="mb-4 font-medium text-ink">{editingId ? 'Edit Package' : 'Add Package'}</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Package type" hint="mock / practice / complete / custom">
            <input value={form.packageType} onChange={(e) => set('packageType', e.target.value)} className="input-dark" />
          </Field>
          <Field label="Display name">
            <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Complete Preparation" className="input-dark" />
          </Field>
          <Field label="Badge text (optional)">
            <input value={form.badgeText} onChange={(e) => set('badgeText', e.target.value)} placeholder="Best Value" className="input-dark" />
          </Field>
        </div>
        <Field label="Short description">
          <input value={form.shortDescription} onChange={(e) => set('shortDescription', e.target.value)} className="input-dark mt-4" />
        </Field>
        <Field label="Included features (one per line)">
          <textarea value={form.includedFeatures} onChange={(e) => set('includedFeatures', e.target.value)} rows={3} className="input-dark mt-1" />
        </Field>
        <label className="mt-3 flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={form.isRecommended} onChange={(e) => set('isRecommended', e.target.checked)} className="h-4 w-4" />
          Recommended package for this certification
        </label>

        <h4 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wide text-ink-faint">Included content</h4>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Mock Exam banks (quizzes)">
            <select
              multiple
              value={form.includedQuizIds}
              onChange={(e) => set('includedQuizIds', Array.from(e.target.selectedOptions, (o) => o.value))}
              className="input-dark h-28"
            >
              {(quizzes?.quizzes ?? []).map((q) => (
                <option key={q.id} value={q.id}>
                  {q.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Practice Test banks">
            <select
              multiple
              value={form.includedPracticeTestIds}
              onChange={(e) => set('includedPracticeTestIds', Array.from(e.target.selectedOptions, (o) => o.value))}
              className="input-dark h-28"
            >
              {(tests?.practiceTests ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <h4 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wide text-ink-faint">Access configuration</h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ToggleField label="Practice access" checked={form.practiceAccessEnabled} onChange={(v) => set('practiceAccessEnabled', v)} />
          <Field label="Accessible questions">
            <input type="number" min={0} value={form.accessibleQuestionCount} onChange={(e) => set('accessibleQuestionCount', e.target.value)} className="input-dark" />
          </Field>
          <ToggleField label="Explanations" checked={form.explanationAccessEnabled} onChange={(v) => set('explanationAccessEnabled', v)} />
          <ToggleField label="Study plan" checked={form.studyPlanAccessEnabled} onChange={(v) => set('studyPlanAccessEnabled', v)} />
          <ToggleField label="Analytics" checked={form.analyticsAccessEnabled} onChange={(v) => set('analyticsAccessEnabled', v)} />
          <ToggleField label="Mock access" checked={form.mockAccessEnabled} onChange={(v) => set('mockAccessEnabled', v)} />
          <Field label="Full mock attempts">
            <input type="number" min={0} value={form.fullMockAttempts} onChange={(e) => set('fullMockAttempts', e.target.value)} className="input-dark" />
          </Field>
          <Field label="Mini-mock attempts">
            <input type="number" min={0} value={form.miniMockAttempts} onChange={(e) => set('miniMockAttempts', e.target.value)} className="input-dark" />
          </Field>
          <Field label="Questions per mock">
            <input type="number" min={0} value={form.questionsPerMock} onChange={(e) => set('questionsPerMock', e.target.value)} className="input-dark" />
          </Field>
          <Field label="Mock duration (minutes)">
            <input type="number" min={0} value={form.mockDurationMinutes} onChange={(e) => set('mockDurationMinutes', e.target.value)} className="input-dark" />
          </Field>
          <Field label="Access validity (days)">
            <input type="number" min={1} value={form.accessValidityDays} onChange={(e) => set('accessValidityDays', e.target.value)} className="input-dark" />
          </Field>
          <ToggleField label="Trial available" checked={form.trialAvailable} onChange={(v) => set('trialAvailable', v)} />
          <ToggleField label="Renewal available" checked={form.renewalAvailable} onChange={(v) => set('renewalAvailable', v)} />
          <ToggleField label="Upgrade available" checked={form.upgradeAvailable} onChange={(v) => set('upgradeAvailable', v)} />
          <ToggleField label="Promo-code eligible" checked={form.promoEligible} onChange={(v) => set('promoEligible', v)} />
          <ToggleField label="Referral eligible" checked={form.referralEligible} onChange={(v) => set('referralEligible', v)} />
          <ToggleField label="Refund eligible" checked={form.refundEligible} onChange={(v) => set('refundEligible', v)} />
        </div>

        <h4 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wide text-ink-faint">Pricing</h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Currency">
            <select value={form.currency} onChange={(e) => set('currency', e.target.value as 'INR' | 'USD')} className="input-dark">
              <option value="INR">INR</option>
              <option value="USD">USD</option>
            </select>
          </Field>
          <Field label="Regular price (₹)">
            <input type="number" min={0} value={form.regularPrice} onChange={(e) => set('regularPrice', e.target.value)} className="input-dark" />
          </Field>
          <Field label="Selling price (₹)">
            <input type="number" min={0} value={form.sellingPrice} onChange={(e) => set('sellingPrice', e.target.value)} className="input-dark" />
          </Field>
          <Field label="Renewal price (₹, optional)">
            <input type="number" min={0} value={form.renewalPrice} onChange={(e) => set('renewalPrice', e.target.value)} className="input-dark" />
          </Field>
          <Field label="Offer price (₹, optional)">
            <input type="number" min={0} value={form.offerPrice} onChange={(e) => set('offerPrice', e.target.value)} className="input-dark" />
          </Field>
          <Field label="Offer start">
            <input type="datetime-local" value={form.offerStart} onChange={(e) => set('offerStart', e.target.value)} className="input-dark" />
          </Field>
          <Field label="Offer end">
            <input type="datetime-local" value={form.offerEnd} onChange={(e) => set('offerEnd', e.target.value)} className="input-dark" />
          </Field>
          <Field label="Tax treatment">
            <select value={form.taxTreatment} onChange={(e) => set('taxTreatment', e.target.value as 'inclusive' | 'exclusive' | 'exempt')} className="input-dark">
              <option value="inclusive">Tax-inclusive</option>
              <option value="exclusive">Tax-exclusive</option>
              <option value="exempt">Tax-exempt</option>
            </select>
          </Field>
          <ToggleField label="Free package" checked={form.isFree} onChange={(v) => set('isFree', v)} />
          <Field label="Display order">
            <input type="number" min={0} value={form.displayOrder} onChange={(e) => set('displayOrder', e.target.value)} className="input-dark" />
          </Field>
        </div>

        {clientErrors.length > 0 && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-500">
            <ul className="list-inside list-disc space-y-0.5">
              {clientErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={!form.name.trim() || clientErrors.length > 0 || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
            className="rounded-lg bg-[#155EEF] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Saving…' : editingId ? 'Update Package' : 'Add Package'}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} className="rounded-lg border border-surface-border px-5 py-2.5 text-sm text-ink-muted">
              Cancel Edit
            </button>
          )}
        </div>
      </div>
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

// ---------------------------------------------------------------------------
// Step 3 — Mock Rules
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
  const [readinessThreshold, setReadinessThreshold] = useState(existingBlueprint?.readinessThresholdPercent !== null ? String(existingBlueprint?.readinessThresholdPercent) : '');

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
    [domains, totalQuestions, durationMinutes, domainCounts]
  );

  const addDomainRow = () => setDomains((d) => [...d, { domain: '', percent: 0, questionCount: 0 }]);
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
    onError: (err) => pushToast(err instanceof Error ? err.message : 'Could not save Mock Rules', 'error'),
  });

  if (certification.contentVersions.length === 0) {
    return <p className="text-sm text-ink-faint">Add a Content Version in Step 1 before configuring Mock Rules.</p>;
  }

  return (
    <div className="space-y-5">
      <Field label="Content version">
        <select value={selectedVersionId} onChange={(e) => setSelectedVersionId(e.target.value)} className="input-dark">
          {certification.contentVersions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.versionName}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Total questions per mock">
          <input type="number" min={1} value={totalQuestions} onChange={(e) => setTotalQuestions(e.target.value)} className="input-dark" />
        </Field>
        <Field label="Duration (minutes)">
          <input type="number" min={1} value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} className="input-dark" />
        </Field>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wide text-ink-faint">Domain allocation</h4>
          <button type="button" onClick={addDomainRow} className="text-xs font-medium text-[#155EEF] hover:underline">
            + Add domain
          </button>
        </div>
        <div className="space-y-2">
          {domains.map((d, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
              <input value={d.domain} onChange={(e) => updateDomainRow(i, { domain: e.target.value })} placeholder="Domain name" className="input-dark" />
              <input type="number" value={d.percent} onChange={(e) => updateDomainRow(i, { percent: Number(e.target.value) })} placeholder="%" className="input-dark" />
              <input type="number" value={d.questionCount} onChange={(e) => updateDomainRow(i, { questionCount: Number(e.target.value) })} placeholder="Questions" className="input-dark" />
              <div className="flex items-center text-xs text-ink-faint">{domainCounts ? `${domainCounts.byDomain[d.domain] ?? 0} eligible` : 'N/A'}</div>
              <button type="button" onClick={() => removeDomainRow(i)} className="text-xs text-red-500 hover:underline">
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

      {!validation.valid && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-500">
          <ul className="list-inside list-disc space-y-0.5">
            {validation.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        disabled={!validation.valid || saveMutation.isPending || domains.length === 0}
        onClick={() => saveMutation.mutate()}
        className="rounded-lg bg-[#155EEF] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {saveMutation.isPending ? 'Saving…' : 'Save Mock Rules'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — Preview & Publish
// ---------------------------------------------------------------------------

function StepPreviewPublish({
  certification,
  packages,
  onChanged,
}: {
  certification: CertificationAdminRow;
  packages: PackageAdminRow[];
  onChanged: () => void;
}) {
  const pushToast = useUiStore((s) => s.pushToast);
  const [showHistory, setShowHistory] = useState(false);
  const [scheduledFor, setScheduledFor] = useState('');
  const sortedPackages = [...packages].sort((a, b) => a.displayOrder - b.displayOrder);
  const recommended = sortedPackages.find((p) => p.isRecommended) ?? sortedPackages[0] ?? null;
  const now = new Date();

  const publishablePackages = sortedPackages.filter((p) => p.status === 'published');
  const packageErrors = sortedPackages
    .filter((p) => p.status !== 'archived')
    .flatMap((p) => {
      const errs: string[] = [];
      if (!hasEntitlement(p.includedQuizIds, p.includedPracticeTestIds)) errs.push(`"${p.name}" has no included content.`);
      if (!hasPublishablePrice(p.sellingPrice, p.isFree)) errs.push(`"${p.name}" has no valid price.`);
      return errs;
    });

  const publishMutation = useMutation({
    mutationFn: () => contentAdminApi.publishCertification(certification.id, scheduledFor || null),
    onSuccess: (res) => {
      pushToast(res.status === 'scheduled' ? 'Publication scheduled' : 'Certification published', 'success');
      onChanged();
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : 'Could not publish', 'error'),
  });
  const unpublishMutation = useMutation({
    mutationFn: () => contentAdminApi.unpublishCertification(certification.id),
    onSuccess: () => {
      pushToast('Certification unpublished', 'success');
      onChanged();
    },
  });
  const archiveMutation = useMutation({
    mutationFn: () => contentAdminApi.archiveCertification(certification.id),
    onSuccess: () => {
      pushToast('Certification archived', 'success');
      onChanged();
    },
  });
  const restoreMutation = useMutation({
    mutationFn: () => contentAdminApi.restoreCertification(certification.id),
    onSuccess: () => {
      pushToast('Certification restored to Draft', 'success');
      onChanged();
    },
  });

  const { data: history } = useQuery({
    queryKey: ['admin', 'certAudit', certification.id],
    queryFn: () => contentAdminApi.getAuditHistoryForCertification(certification.id),
    enabled: showHistory,
  });

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-faint">Learner card preview (admin-only)</h3>
        <div className="rounded-xl border border-[#DCE7FF] bg-white p-5 shadow-sm dark:bg-surface-raised">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#155EEF] text-lg font-bold text-white">
              {certification.shortName.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-[#64748B]">{certification.provider}</div>
              <div className="font-semibold text-[#0F172A]">{certification.name}</div>
              <p className="text-sm text-[#64748B]">{certification.shortDescription || certification.description}</p>
            </div>
          </div>
          {publishablePackages.length === 0 ? (
            <p className="mt-4 text-sm text-[#64748B]">No published packages yet, this card would show "Coming Soon" to learners.</p>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              {publishablePackages.map((pkg) => {
                const offerStatus = computeOfferStatus(
                  { offerPrice: pkg.offerPrice, offerStart: pkg.offerStart ? toDate(pkg.offerStart) : null, offerEnd: pkg.offerEnd ? toDate(pkg.offerEnd) : null, offerCancelledAt: pkg.offerCancelledAt ? toDate(pkg.offerCancelledAt) : null },
                  now
                );
                const currentPrice = offerStatus === 'active' ? pkg.offerPrice! : pkg.sellingPrice;
                return (
                  <div key={pkg.id} className={`rounded-lg border px-3 py-2 text-sm ${pkg.id === recommended?.id ? 'border-[#155EEF] bg-[#EFF6FF]' : 'border-[#DCE7FF]'}`}>
                    <div className="font-semibold text-[#0F172A]">
                      {pkg.name} {pkg.badgeText && <span className="ml-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-600">{pkg.badgeText}</span>}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {pkg.regularPrice > currentPrice && <span className="text-xs text-[#94A3B8] line-through">{formatMoney(pkg.regularPrice, pkg.currency)}</span>}
                      <span className="font-bold text-[#0F172A]">{pkg.isFree ? 'Free' : formatMoney(currentPrice, pkg.currency)}</span>
                    </div>
                    <div className="text-xs text-[#64748B]">
                      {pkg.accessValidityDays} days access{pkg.mockAccessEnabled ? ` · ${pkg.fullMockAttempts} mocks` : ''}
                      {pkg.practiceAccessEnabled ? ` · ${pkg.accessibleQuestionCount} questions` : ''}
                    </div>
                    <button
                      type="button"
                      disabled
                      className="mt-2 w-full rounded bg-[#155EEF] py-1 text-xs font-semibold text-white opacity-90"
                    >
                      {pkg.id === recommended?.id ? `Buy ${certification.shortName} ${pkg.name} for ${formatMoney(currentPrice, pkg.currency)}` : `Buy for ${formatMoney(currentPrice, pkg.currency)}`}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {packageErrors.length > 0 && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-500">
          <div className="mb-1 font-semibold">Fix these before publishing:</div>
          <ul className="list-inside list-disc space-y-0.5">
            {packageErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-surface-border bg-surface-raised p-5">
        <h3 className="mb-3 font-medium text-ink">Publishing</h3>
        <div className="mb-4 flex items-center gap-2 text-sm">
          <span className="text-ink-faint">Current status:</span>
          <span className="rounded-full bg-[#E8F0FF] px-2 py-0.5 font-semibold capitalize text-[#155EEF]">{certification.status}</span>
        </div>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Field label="Schedule for (optional)">
            <input type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} className="input-dark" />
          </Field>
          <button
            type="button"
            disabled={packageErrors.length > 0 || publishMutation.isPending}
            onClick={() => {
              if (window.confirm(scheduledFor ? 'Schedule this certification to publish at the chosen time?' : 'Publish this certification now?')) {
                publishMutation.mutate();
              }
            }}
            className="rounded-lg bg-[#155EEF] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {scheduledFor ? 'Schedule Publication' : 'Publish Now'}
          </button>
          {certification.status === 'published' && (
            <button type="button" onClick={() => unpublishMutation.mutate()} className="rounded-lg border border-surface-border px-5 py-2.5 text-sm text-ink-muted">
              Unpublish
            </button>
          )}
          {certification.status === 'archived' ? (
            <button type="button" onClick={() => restoreMutation.mutate()} className="rounded-lg border border-surface-border px-5 py-2.5 text-sm text-ink-muted">
              Restore
            </button>
          ) : (
            <button type="button" onClick={() => window.confirm('Archive this certification?') && archiveMutation.mutate()} className="rounded-lg border border-surface-border px-5 py-2.5 text-sm text-ink-muted hover:border-red-500/50 hover:text-red-400">
              Archive
            </button>
          )}
        </div>
        <button type="button" onClick={() => setShowHistory((v) => !v)} className="text-sm font-medium text-[#155EEF] hover:underline">
          {showHistory ? 'Hide' : 'View'} History
        </button>
        {showHistory && (
          <div className="mt-3 space-y-2">
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
    </div>
  );
}
