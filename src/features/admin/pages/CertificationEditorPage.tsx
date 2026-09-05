import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { confirmDialog } from '@/store/useDialogStore';
import { ModalCloseButton } from '@/components/common/ModalCloseButton';
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
import { hasEntitlement, hasPublishablePrice, isOfferPriceValid } from '../lib/packageValidation';
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
import { deriveMockBlueprint } from '../lib/deriveMockBlueprint';
import { VALIDITY_PRESETS, presetForDays } from '../lib/validityPresets';
import { uploadContentFile } from '../api/uploadApi';
import { UploadReport } from '@/components/common/UploadReport';
import { downloadTemplate } from '@/lib/downloadTemplate';
import { errorText, friendlyApiError } from '@/lib/errorMessages';
import type { DomainAllocation } from '@/types/models';

// ===========================================================================
// One linear wizard - the SAME four steps for both "create" and "edit".
//   1 Basics      - name the product
//   2 Questions   - upload a document OR link existing banks
//   3 Packages    - which packages to sell, and their price
//   4 Publish     - preview and go live
// Every step has a "Save draft" button so an admin can stop and resume.
// ===========================================================================

type Step = 1 | 2 | 3 | 4;
const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: 'Basics' },
  { n: 2, label: 'Questions' },
  { n: 3, label: 'Packages' },
  { n: 4, label: 'Publish' },
];
const TEMPLATE_ORDER: TemplateId[] = ['practice', 'mock', 'complete'];

function toInputDateTime(v: unknown): string {
  if (!v) return '';
  const d = toDate(v);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
// "2 days" / "1 week" / "6 months" / "1 year" from a raw day count.
function humanizeDays(days: number): string {
  if (!days || days <= 0) return '';
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'} (${days} days)`;
  if (days % 365 === 0) return plural(days / 365, 'year');
  if (days % 30 === 0) return plural(days / 30, 'month');
  if (days % 7 === 0) return plural(days / 7, 'week');
  return `${days} day${days === 1 ? '' : 's'}`;
}
function daysBetween(from: string, to: string): number {
  if (!from || !to) return 0;
  const ms = new Date(to).getTime() - new Date(from).getTime();
  return ms > 0 ? Math.round(ms / 86_400_000) : 0;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export function CertificationEditorPage() {
  const params = useParams<{ certificationId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);

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

  const exitToList = () => {
    setDirty(false);
    invalidate();
    navigate('/admin/products');
  };

  const cancelSafely = async () => {
    if (
      dirty &&
      !(await confirmDialog({
        title: 'Leave without saving?',
        message: 'You have unsaved changes. They will be lost.',
        confirmLabel: 'Leave',
        cancelLabel: 'Keep editing',
        danger: true,
      }))
    )
      return;
    navigate('/admin/products');
  };

  const goTo = (n: Step) => setStep(n);
  const isNew = !certificationId;

  if (params.certificationId && !certification) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-ink">Exam Preparation</h1>
        <p className="mt-6 text-sm text-ink-faint">{allCerts.length === 0 ? 'Loading…' : 'This exam preparation could not be found.'}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl lg:max-w-5xl">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">{certification ? certification.name : 'New Exam Preparation'}</h1>
        <button type="button" onClick={cancelSafely} className="text-sm text-ink-faint hover:text-ink">
          Close
        </button>
      </div>
      <p className="mb-5 max-w-2xl text-sm text-ink-faint">
        Four short steps. Use “Save draft” any time to stop and come back later.
      </p>

      <Stepper current={step} onGo={goTo} unlocked={isNew ? 1 : 4} />

      <div className="mt-6">
        {step === 1 && (
          <StepBasics
            certification={certification}
            otherCerts={allCerts.filter((c) => c.id !== certificationId)}
            onDirty={() => setDirty(true)}
            onExit={exitToList}
            onSaved={(id, advance) => {
              setCertificationId(id);
              setDirty(false);
              invalidate();
              if (!params.certificationId) navigate(`/admin/products/${id}`, { replace: true });
              pushToast('Saved', 'success');
              if (advance) goTo(2);
            }}
          />
        )}

        {step === 2 &&
          (certification ? (
            <StepQuestions
              certification={certification}
              onDirty={() => setDirty(true)}
              onExit={exitToList}
              onSaved={() => { setDirty(false); invalidate(); goTo(3); }}
              onBack={() => goTo(1)}
            />
          ) : (
            <LockedStep onBack={() => goTo(1)} />
          ))}

        {step === 3 &&
          (certification ? (
            <StepPackages
              key={packages.map((p) => p.id).join(',')}
              certification={certification}
              packages={packages}
              onDirty={() => setDirty(true)}
              onExit={exitToList}
              onSaved={() => { setDirty(false); invalidate(); goTo(4); }}
              onBack={() => goTo(2)}
            />
          ) : (
            <LockedStep onBack={() => goTo(2)} />
          ))}

        {step === 4 &&
          (certification ? (
            <StepPublish certification={certification} packages={packages} onChanged={invalidate} onExit={exitToList} onBack={() => goTo(3)} />
          ) : (
            <LockedStep onBack={() => goTo(3)} />
          ))}
      </div>
    </div>
  );
}

function Stepper({ current, onGo, unlocked }: { current: Step; onGo: (n: Step) => void; unlocked: number }) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-surface-border">
      {STEPS.map(({ n, label }) => {
        const locked = n > unlocked && n !== current && n > 1;
        return (
          <button
            key={n}
            type="button"
            disabled={locked}
            onClick={() => onGo(n)}
            className={`border-b-2 px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
              current === n ? 'border-brand-500 text-brand-ink' : 'border-transparent text-ink-faint hover:text-ink'
            }`}
          >
            {n}. {label}
          </button>
        );
      })}
    </div>
  );
}

function LockedStep({ onBack }: { onBack: () => void }) {
  return (
    <div>
      <p className="rounded-xl border border-dashed border-surface-border p-8 text-center text-sm text-ink-faint">
        Finish Step 1 first - it only takes a moment.
      </p>
      <WizardFooter onBack={onBack} />
    </div>
  );
}

// Consistent bottom bar: Save draft (left, next to Back) + a primary action (right).
function WizardFooter({
  onBack,
  primary,
  draft,
}: {
  onBack?: () => void;
  primary?: { label: string; onClick: () => void; disabled?: boolean; busy?: boolean };
  draft?: { onClick: () => void; busy?: boolean };
}) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        {onBack && (
          <button type="button" onClick={onBack} className="rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted hover:border-brand-400">
            ← Back
          </button>
        )}
        {draft && (
          <button
            type="button"
            onClick={draft.onClick}
            disabled={draft.busy}
            className="rounded-lg border border-surface-border-strong px-4 py-2 text-sm font-medium text-ink-muted hover:border-brand-400 disabled:opacity-50"
          >
            {draft.busy ? 'Saving…' : 'Save draft'}
          </button>
        )}
      </div>
      {primary && (
        <button
          type="button"
          disabled={primary.disabled || primary.busy}
          onClick={primary.onClick}
          className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
        >
          {primary.busy ? 'Saving…' : primary.label}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
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

// A switch that reads as an on/off control, used for "Generate mock exams".
function Switch({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <div>
      <label className="flex cursor-pointer items-center gap-3">
        <span
          className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-brand-500' : 'bg-surface-border-strong'}`}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
        </span>
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only" />
        <span className="text-sm font-medium text-ink">{label}</span>
      </label>
      {hint && <p className="mt-1 text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}

function ValiditySelect({ days, onChange }: { days: number; onChange: (d: number) => void }) {
  const preset = presetForDays(days);
  const initialMode: 'preset' | 'days' | 'range' = preset ? 'preset' : days > 0 ? 'days' : 'preset';
  const [mode, setMode] = useState<'preset' | 'days' | 'range'>(initialMode);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const rangeDays = daysBetween(from, to);

  return (
    <div className="space-y-2">
      <select
        value={mode === 'preset' && preset ? String(days) : mode === 'range' ? 'range' : 'days'}
        onChange={(e) => {
          if (e.target.value === 'range') { setMode('range'); return; }
          if (e.target.value === 'days') { setMode('days'); return; }
          setMode('preset');
          onChange(Number(e.target.value));
        }}
        className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink"
      >
        {VALIDITY_PRESETS.map((p) => (
          <option key={p.days} value={p.days}>{p.label}</option>
        ))}
        <option value="days">Custom - number of days</option>
        <option value="range">Custom - from / to dates</option>
      </select>

      {mode === 'days' && (
        <input
          type="number"
          min={1}
          value={days || ''}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
          placeholder="Days of access"
          className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink"
        />
      )}

      {mode === 'range' && (() => {
        const today = new Date().toISOString().slice(0, 10);
        const fromPast = !!from && from < today;
        const toBeforeFrom = !!to && !!from && to <= from;
        return (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={from}
                min={today}
                onChange={(e) => { setFrom(e.target.value); const d = daysBetween(e.target.value, to); if (d) onChange(d); }}
                className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink"
              />
              <input
                type="date"
                value={to}
                min={from || today}
                onChange={(e) => { setTo(e.target.value); const d = daysBetween(from, e.target.value); if (d) onChange(d); }}
                className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink"
              />
            </div>
            {fromPast && <p className="text-xs text-danger">The start date cannot be in the past.</p>}
            {!fromPast && toBeforeFrom && <p className="text-xs text-danger">The end date must be after the start date.</p>}
            {!fromPast && !toBeforeFrom && rangeDays > 0 && <p className="text-xs font-medium text-brand-ink">= {humanizeDays(rangeDays)}</p>}
          </div>
        );
      })()}
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

// ---------------------------------------------------------------------------
// Step 1 - Basics
// ---------------------------------------------------------------------------

function StepBasics({
  certification,
  otherCerts,
  onDirty,
  onExit,
  onSaved,
}: {
  certification: CertificationAdminRow | null;
  otherCerts: CertificationAdminRow[];
  onDirty: () => void;
  onExit: () => void;
  onSaved: (id: string, advance: boolean) => void;
}) {
  const pushToast = useUiStore((s) => s.pushToast);

  const [shortName, setShortName] = useState(certification?.shortName ?? '');
  const [name, setName] = useState(certification?.name ?? '');
  const [nameTouched, setNameTouched] = useState(!!certification);
  const [provider, setProvider] = useState(certification?.provider ?? 'Other');
  const [shortDescription, setShortDescription] = useState(certification?.shortDescription ?? '');
  const [defaultValidityDays, setDefaultValidityDays] = useState(String(certification?.defaultValidityDays ?? 180));
  const [disclaimer, setDisclaimer] = useState(certification?.independentPrepDisclaimer ?? '');
  const [disclaimerTouched, setDisclaimerTouched] = useState(!!certification?.independentPrepDisclaimer);

  // Kept but no longer edited here - filled in automatically. Every product
  // shows in the learner "Prepare for Your Certification" section once
  // published, regardless of these.
  const description = certification?.description ?? '';

  const touched = () => onDirty();

  const effectiveName = nameTouched ? name : shortName ? `${shortName} Exam Preparation` : '';
  const autoSlug = useMemo(
    () => uniqueSlug(slugify(shortName || effectiveName), otherCerts.map((c) => c.slug)),
    [shortName, effectiveName, otherCerts],
  );
  const effectiveSlug = certification?.slug || autoSlug;
  const effectiveDisclaimer = disclaimerTouched ? disclaimer : buildDisclaimer(shortName, provider);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        shortName: shortName.trim(),
        name: effectiveName.trim(),
        provider,
        slug: effectiveSlug,
        category: certification?.category || provider,
        shortDescription,
        description,
        iconKey: certification?.iconKey ?? iconForProvider(provider),
        effectiveFrom: certification?.effectiveFrom ? toDate(certification.effectiveFrom).toISOString() : null,
        effectiveTo: certification?.effectiveTo ? toDate(certification.effectiveTo).toISOString() : null,
        defaultValidityDays: Number(defaultValidityDays) || 180,
        featured: certification?.featured ?? false,
        independentPrepDisclaimer: effectiveDisclaimer,
        displayOrder: certification ? certification.displayOrder : nextDisplayOrder(otherCerts),
      };
      return certification
        ? await contentAdminApi.updateCertification({ certificationId: certification.id, ...payload }).then(() => certification.id)
        : await contentAdminApi.createCertification(payload).then((r) => r.certificationId);
    },
    onError: (err) => pushToast(cleanError(err, 'Could not save'), 'error'),
  });

  const canSave = shortName.trim().length > 0 && effectiveName.trim().length >= 2;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Exam code" hint="e.g. CISM">
          <input value={shortName} onChange={(e) => { setShortName(e.target.value); touched(); }} className="input-dark" />
        </Field>
        <Field label="Name" hint={nameTouched ? undefined : 'Auto from the exam code - edit to override'}>
          <input value={effectiveName} onChange={(e) => { setName(e.target.value); setNameTouched(true); touched(); }} className="input-dark" />
        </Field>
        <Field label="Certification body" hint="e.g. ISACA">
          <CategorySelect value={provider} onChange={(v) => { setProvider(v); touched(); }} />
        </Field>
        <Field label="Access validity" hint="Applies to every package - set it once here.">
          <ValiditySelect days={Number(defaultValidityDays) || 0} onChange={(d) => { setDefaultValidityDays(String(d)); touched(); }} />
        </Field>
      </div>

      <Field label="Short description" hint={`For the product card. ${shortDescription.length}/300`}>
        <textarea
          value={shortDescription}
          onChange={(e) => { setShortDescription(e.target.value.slice(0, 300)); touched(); }}
          maxLength={300}
          rows={2}
          className="input-dark max-w-2xl"
          placeholder="Prepare with practice questions, realistic mock exams, detailed explanations and analytics."
        />
      </Field>

      <Field label="Independent-preparation disclaimer" hint="Auto-generated from the exam name and body.">
        <textarea
          value={disclaimerTouched ? disclaimer : effectiveDisclaimer}
          onChange={(e) => { setDisclaimer(e.target.value); setDisclaimerTouched(true); touched(); }}
          rows={4}
          className="input-dark max-w-2xl"
        />
      </Field>

      {certification && <ContentVersionsPanel certification={certification} onDirty={onDirty} />}

      <WizardFooter
        draft={{ onClick: () => save.mutate(undefined, { onSuccess: () => { pushToast('Draft saved', 'success'); onExit(); } }), busy: save.isPending }}
        primary={{
          label: 'Save & continue →',
          onClick: () => save.mutate(undefined, { onSuccess: (id) => onSaved(id, true) }),
          disabled: !canSave,
          busy: save.isPending,
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 - Questions
// ---------------------------------------------------------------------------

function StepQuestions({
  certification,
  onDirty,
  onExit,
  onSaved,
  onBack,
}: {
  certification: CertificationAdminRow;
  onDirty: () => void;
  onExit: () => void;
  onSaved: () => void;
  onBack: () => void;
}) {
  const pushToast = useUiStore((s) => s.pushToast);
  const queryClient = useQueryClient();
  const { data: tests } = useQuery({ queryKey: ['admin', 'practiceTests'], queryFn: contentAdminApi.listPracticeTestsAdmin });
  const { data: quizzes } = useQuery({ queryKey: ['admin', 'quizzes'], queryFn: contentAdminApi.listQuizzesAdmin });

  const practiceBankIds = certification.practiceBankIds?.length
    ? certification.practiceBankIds
    : certification.practiceBankId
      ? [certification.practiceBankId]
      : [];
  const hasContent = practiceBankIds.length > 0 || !!certification.seriesId;

  const [editing, setEditing] = useState(!hasContent);
  const [mode, setMode] = useState<'upload' | 'existing'>(certification.seriesId ? 'upload' : 'existing');
  const [practiceBankId, setPracticeBankId] = useState(certification.practiceBankId ?? '');
  const [mockBankId, setMockBankId] = useState(certification.mockBankId ?? '');

  const practiceBanks = tests?.practiceTests ?? [];
  const quizBanks = (quizzes?.quizzes ?? []).filter((q) => q.isPublished);
  const practiceBankList = practiceBanks.filter((t) => practiceBankIds.includes(t.id));
  const practiceQuestionTotal = practiceBankList.reduce((sum, t) => sum + (t.totalQuestions ?? 0), 0);
  const mockBank = quizBanks.find((q) => q.id === certification.mockBankId) ?? null;
  const mockCount =
    (quizzes?.quizzes ?? []).filter((q) => (certification.mockBankIds ?? []).includes(q.id)).length ||
    (certification.mockBankId ? 1 : 0);

  const linkBanks = useMutation({
    mutationFn: async () => {
      await contentAdminApi.updateCertification({
        certificationId: certification.id,
        practiceBankId: practiceBankId || null,
        mockBankId: mockBankId || null,
      });
      if (mockBankId && !(certification.contentVersions ?? []).some((v) => v.associatedBankId === mockBankId)) {
        try {
          await contentAdminApi.saveContentVersion(certification.id, {
            versionName: `${certification.shortName || 'Exam'} - current outline`,
            versionCode: `${certification.slug}-v1`.slice(0, 50),
            associatedBankType: 'quiz',
            associatedBankId: mockBankId,
            effectiveFrom: new Date().toISOString(),
            effectiveTo: null,
            status: 'active',
            notes: 'Auto-created from the product wizard',
          });
        } catch (e) {
          pushToast(errorText(e, 'Saved, but the mock question bank could not be linked'), 'error');
        }
      }
      queryClient.invalidateQueries({ queryKey: ['admin', 'certifications'] });
    },
    onError: (err) => pushToast(cleanError(err, 'Could not link the question banks'), 'error'),
  });

  if (hasContent && !editing) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-success/40 bg-success-soft p-4 text-sm">
          <div className="font-semibold text-ink">Questions are ready</div>
          <div className="mt-1 text-ink-muted">
            {(certification.seriesId ? practiceQuestionTotal : practiceBankList[0]?.totalQuestions ?? 0).toLocaleString()} practice questions
            {certification.seriesId ? ` · ${practiceBankList.length} practice exams` : ''}
            {mockCount > 0 ? ` · ${mockCount} mock exam${mockCount === 1 ? '' : 's'}` : mockBank ? ' · 1 mock exam bank' : ''}
          </div>
          <button type="button" onClick={() => setEditing(true)} className="mt-2 text-xs font-semibold text-brand-ink hover:underline">
            Change
          </button>
        </div>
        <WizardFooter onBack={onBack} draft={{ onClick: onExit }} primary={{ label: 'Continue →', onClick: onSaved }} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3">
        {(['upload', 'existing'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
              mode === m ? 'border-brand-500 bg-brand-500 text-white' : 'border-surface-border-strong bg-surface-raised text-ink-muted hover:border-brand-400'
            }`}
          >
            {m === 'upload' ? 'Upload a document' : 'Use existing banks'}
          </button>
        ))}
      </div>

      {mode === 'upload' ? (
        <>
          <BatchedSeriesPanel
            certification={certification}
            onGenerated={() => {
              queryClient.invalidateQueries({ queryKey: ['admin', 'certifications'] });
              queryClient.invalidateQueries({ queryKey: ['admin', 'practiceTests'] });
              queryClient.invalidateQueries({ queryKey: ['admin', 'quizzes'] });
              onDirty();
              setEditing(false);
            }}
          />
          <WizardFooter onBack={onBack} draft={{ onClick: onExit }} primary={hasContent ? { label: 'Continue →', onClick: onSaved } : undefined} />
        </>
      ) : (
        <>
          <Field label="Practice question bank" hint="Your Practice and Complete packages draw from this.">
            <select value={practiceBankId} onChange={(e) => { setPracticeBankId(e.target.value); onDirty(); }} className="input-dark">
              <option value="">Select a question bank…</option>
              {practiceBanks.map((b) => (
                <option key={b.id} value={b.id}>{b.title} - {b.totalQuestions.toLocaleString()} questions</option>
              ))}
            </select>
          </Field>
          <Field label="Mock exam question bank (optional)" hint="Only needed if you will sell Mock Exams or Complete Preparation.">
            <select value={mockBankId} onChange={(e) => { setMockBankId(e.target.value); onDirty(); }} className="input-dark">
              <option value="">Not set</option>
              {quizBanks.map((b) => (
                <option key={b.id} value={b.id}>{b.title} - {b.totalQuestions.toLocaleString()} questions</option>
              ))}
            </select>
          </Field>
          <WizardFooter
            onBack={onBack}
            draft={{ onClick: () => linkBanks.mutate(undefined, { onSuccess: () => { pushToast('Draft saved', 'success'); onExit(); } }), busy: linkBanks.isPending }}
            primary={{
              label: 'Save & continue →',
              onClick: () => linkBanks.mutate(undefined, { onSuccess: onSaved }),
              disabled: !practiceBankId,
              busy: linkBanks.isPending,
            }}
          />
        </>
      )}
    </div>
  );
}

function BatchedSeriesPanel({
  certification,
  onGenerated,
}: {
  certification: CertificationAdminRow;
  onGenerated: () => void;
}) {
  const pushToast = useUiStore((s) => s.pushToast);
  const [file, setFile] = useState<File | null>(null);
  const [practiceBatchSize, setPracticeBatchSize] = useState('150');
  const [generateMocks, setGenerateMocks] = useState(true);
  const [mockCount, setMockCount] = useState('5');
  const [mockBatchSize, setMockBatchSize] = useState('150');
  const [mockDurationMinutes, setMockDurationMinutes] = useState('240');
  const [passMarkPercent, setPassMarkPercent] = useState('60');
  const [uploading, setUploading] = useState(false);
  const [report, setReport] = useState<
    { totalQuestions: number; practiceExams: number; mockExams: number; errors: ParseErrorEntry[]; warnings: string[] } | null
  >(null);

  const gen = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Choose a question document to upload');
      setUploading(true);
      try {
        const fileUrl = await uploadContentFile(file);
        return await contentAdminApi.createBatchedSeries({
          certificationId: certification.id,
          fileUrl,
          sourceFormat: 'standard',
          examName: (certification.shortName || certification.name).trim(),
          category: (certification.category || certification.provider).trim() || 'Other',
          practiceBatchSize: Number(practiceBatchSize) || 150,
          mockCount: generateMocks ? Number(mockCount) || 5 : 0,
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
      setReport({
        totalQuestions: r.totalQuestions,
        practiceExams: r.practiceTestIds.length,
        mockExams: r.mockQuizIds.length,
        errors: r.parseErrors,
        warnings: r.parseWarnings,
      });
      setFile(null);
      onGenerated();
    },
    onError: (err) => pushToast(cleanError(err, 'Could not generate the question set'), 'error'),
  });

  return (
    <div className="space-y-4 rounded-xl border border-surface-border bg-surface-raised p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-ink">Upload one question document (.docx)</h3>
          <p className="mt-1 max-w-xl text-xs text-ink-muted">
            We split it into practice exams (no repeats, every question covered) plus, if enabled, fixed mock exams that
            shuffle on every attempt. The document must match the template.
          </p>
        </div>
        <button
          type="button"
          onClick={() => downloadTemplate('standard')}
          className="shrink-0 rounded-lg bg-brand-500 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-600"
        >
          ↓ Download template
        </button>
      </div>

      {certification.seriesId && (
        <p className="rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-warning">
          A set is already linked. Generating again replaces it.
        </p>
      )}

      <Field label="Question document">
        <div className="flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
            Choose file
            <input type="file" accept=".docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="sr-only" />
          </label>
          <span className="text-sm text-ink-muted">{file ? file.name : 'No file chosen'}</span>
        </div>
      </Field>

      <div className="rounded-lg border border-surface-border bg-surface p-4">
        <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-faint">Practice exam settings</h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Questions per practice exam">
            <input type="number" min={1} value={practiceBatchSize} onChange={(e) => setPracticeBatchSize(e.target.value)} className="input-dark" />
          </Field>
        </div>

        <div className="mt-4 border-t border-surface-border pt-4">
          <Switch label="Generate mock exams" checked={generateMocks} onChange={setGenerateMocks} hint="Turn off to create practice exams only." />
          {generateMocks && (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          )}
        </div>
      </div>

      <button
        type="button"
        disabled={!file || gen.isPending || uploading}
        onClick={() => gen.mutate()}
        className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {uploading ? 'Uploading...' : gen.isPending ? 'Generating...' : 'Generate'}
      </button>

      {report &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:items-center" onClick={() => setReport(null)}>
            <div className="relative my-auto w-full max-w-lg rounded-2xl border border-surface-border bg-surface-raised p-6" onClick={(e) => e.stopPropagation()}>
              <ModalCloseButton onClose={() => setReport(null)} />
              <h2 className="pr-8 text-lg font-bold text-ink">Upload complete</h2>
              <p className="mt-2 text-sm text-ink-muted">
                {report.totalQuestions.toLocaleString()} questions imported - {report.practiceExams} practice exam
                {report.practiceExams === 1 ? '' : 's'}
                {report.mockExams > 0 ? ` and ${report.mockExams} mock exam${report.mockExams === 1 ? '' : 's'}` : ''} created.
              </p>
              <div className="mt-4">
                <UploadReport totalQuestions={report.totalQuestions} errors={report.errors} warnings={report.warnings} onDismiss={() => setReport(null)} />
              </div>
              <button
                type="button"
                onClick={() => setReport(null)}
                className="mt-5 w-full rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
              >
                Close
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 - Packages
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
  onDirty,
  onExit,
  onSaved,
  onBack,
}: {
  certification: CertificationAdminRow;
  packages: PackageAdminRow[];
  onDirty: () => void;
  onExit: () => void;
  onSaved: () => void;
  onBack: () => void;
}) {
  const pushToast = useUiStore((s) => s.pushToast);
  const { data: allTests } = useQuery({ queryKey: ['admin', 'practiceTests'], queryFn: contentAdminApi.listPracticeTestsAdmin });
  const { data: practiceDomains } = useQuery({
    queryKey: ['admin', 'bankDomainCounts', 'practiceTest', certification.practiceBankId],
    queryFn: () => contentAdminApi.getBankDomainCounts('practiceTest', certification.practiceBankId!),
    enabled: !!certification.practiceBankId && !certification.seriesId,
  });
  const seriesQuestionTotal = (allTests?.practiceTests ?? [])
    .filter((t) => (certification.practiceBankIds ?? []).includes(t.id))
    .reduce((sum, t) => sum + (t.totalQuestions ?? 0), 0);
  const eligiblePracticeQuestions = certification.seriesId
    ? seriesQuestionTotal || Number.MAX_SAFE_INTEGER
    : practiceDomains?.totalQuestions ?? Number.MAX_SAFE_INTEGER;
  const questionCount = eligiblePracticeQuestions === Number.MAX_SAFE_INTEGER ? 0 : eligiblePracticeQuestions;
  const validityDays = certification.defaultValidityDays;

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
        : { enabled: false, values: emptyTemplateValues(validityDays) };
    }
    return base;
  });

  const setCard = (id: TemplateId, patch: Partial<CardState>) => { setCards((c) => ({ ...c, [id]: { ...c[id], ...patch } })); onDirty(); };
  const setValue = (id: TemplateId, key: keyof TemplateValues, value: TemplateValues[keyof TemplateValues]) => {
    if (id === 'complete' && (key === 'sellingPrice' || key === 'regularPrice')) setCompletePriceTouched(true);
    setCards((c) => ({ ...c, [id]: { ...c[id], values: { ...c[id].values, [key]: value } } }));
    onDirty();
  };

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

  const save = useMutation({
    mutationFn: async () => {
      for (const id of TEMPLATE_ORDER) {
        const card = cards[id];
        const existing = templatePackages[id];
        if (card.enabled) {
          const v: TemplateValues = {
            ...card.values,
            validityDays,
            numberOfQuestions: questionCount || card.values.numberOfQuestions,
            offerStart: null,
            offerEnd: null,
            badgeText: null,
          };
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
            defaultValidityDays: validityDays,
            currency: existing?.currency ?? 'INR',
            displayOrder: existing?.displayOrder ?? TEMPLATE_ORDER.indexOf(id),
          });
          if (existing) await contentAdminApi.updatePackage({ packageId: existing.id, ...payload });
          else await contentAdminApi.createPackage(payload);
        } else if (existing && existing.status === 'draft') {
          await contentAdminApi.deletePackage(existing.id);
        }
      }
    },
    onError: (err) => pushToast(cleanError(err, 'Could not save the packages'), 'error'),
  });

  const anyEnabled = TEMPLATE_ORDER.some((id) => cards[id].enabled);
  const anyPriceBad = TEMPLATE_ORDER.some((id) => cards[id].enabled && !hasPublishablePrice(cards[id].values.sellingPrice, false));
  const noContent = !certification.practiceBankId && !certification.seriesId && !certification.practiceBankIds?.length;

  return (
    <div className="space-y-4">
      {noContent && (
        <p className="rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm text-warning">
          Add questions in Step 2 first - link a bank or upload a document.
        </p>
      )}

      {TEMPLATE_ORDER.map((id) => (
        <TemplateCard
          key={id}
          id={id}
          state={cards[id]}
          certification={certification}
          questionCount={questionCount}
          validityDays={validityDays}
          partsSellingMinor={partsSelling}
          onToggle={(enabled) => setCard(id, { enabled })}
          onValue={(k, val) => setValue(id, k, val)}
        />
      ))}

      {packages.length > 0 && <LearnerPreview certification={certification} packages={packages} />}

      <WizardFooter
        onBack={onBack}
        draft={{ onClick: () => save.mutate(undefined, { onSuccess: () => { pushToast('Draft saved', 'success'); onExit(); } }), busy: save.isPending }}
        primary={{
          label: 'Save & continue →',
          onClick: () => save.mutate(undefined, { onSuccess: () => { pushToast('Packages saved', 'success'); onSaved(); } }),
          disabled: !anyEnabled || anyPriceBad || noContent,
          busy: save.isPending,
        }}
      />
    </div>
  );
}

function TemplateCard({
  id,
  state,
  certification,
  questionCount,
  validityDays,
  partsSellingMinor,
  onToggle,
  onValue,
}: {
  id: TemplateId;
  state: CardState;
  certification: CertificationAdminRow;
  questionCount: number;
  validityDays: number;
  partsSellingMinor: number;
  onToggle: (enabled: boolean) => void;
  onValue: <K extends keyof TemplateValues>(key: K, value: TemplateValues[K]) => void;
}) {
  const def = PACKAGE_TEMPLATES[id];
  const v = state.values;
  const needsMockBank = (id === 'mock' || id === 'complete') && !certification.mockBankId;
  const [priceTouched, setPriceTouched] = useState(false);
  const [offerTouched, setOfferTouched] = useState(false);

  const money = (minor: number | null) => (minor == null ? '' : String(minorToMajor(minor)));
  const setMoney = <K extends keyof TemplateValues>(key: K, raw: string) =>
    onValue(key, (raw === '' ? null : majorToMinor(Number(raw) || 0)) as TemplateValues[K]);

  const benefits = buildPackageBenefits(id, v, questionCount || 0);
  const priceBad = state.enabled && !hasPublishablePrice(v.sellingPrice, false);
  const offerBad = v.offerPrice != null && !isOfferPriceValid(v.offerPrice, v.regularPrice ?? v.sellingPrice);

  const autoLine = [
    `${validityDays} days access`,
    (id === 'practice' || id === 'complete') && questionCount ? `${questionCount.toLocaleString()} questions` : null,
    (id === 'mock' || id === 'complete') ? `${v.mockAttempts} mock exam${v.mockAttempts === 1 ? '' : 's'}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

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
            <p className="rounded-lg border border-warning/40 bg-warning-soft p-3 text-xs text-warning">
              Generate or link a mock exam bank in Step 2 to publish this package.
            </p>
          )}

          {autoLine && <p className="text-xs text-ink-faint">{autoLine}</p>}

          {id === 'complete' && (
            <p className="rounded-lg border border-brand-500/30 bg-brand-50 p-3 text-xs text-brand-ink dark:bg-brand-500/10">
              Auto-priced as Practice + Mock (₹{minorToMajor(partsSellingMinor)}) minus any combo saving below, until you
              type a price.
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Display Price (₹)">
              <input
                type="number"
                min={0}
                value={money(v.sellingPrice) || ''}
                onChange={(e) => setMoney('sellingPrice', e.target.value)}
                onBlur={() => setPriceTouched(true)}
                className="input-dark"
              />
              {priceTouched && priceBad && <p className="mt-1 text-xs text-danger">Display Price must be greater than ₹0.</p>}
            </Field>
            <Field label="Market price (₹, optional)" hint="Shown struck-through as the 'was' price.">
              <input type="number" min={0} value={money(v.regularPrice)} onChange={(e) => setMoney('regularPrice', e.target.value)} className="input-dark" />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Display Offer price (₹, optional)" hint="An always-on discounted price.">
              <input
                type="number"
                min={0}
                value={money(v.offerPrice)}
                onChange={(e) => setMoney('offerPrice', e.target.value)}
                onBlur={() => setOfferTouched(true)}
                className="input-dark"
              />
              {offerTouched && offerBad && <p className="mt-1 text-xs text-danger">Offer price must be at or below the market price.</p>}
            </Field>
            <Field label="Renewal price (₹, optional)">
              <input type="number" min={0} value={money(v.renewalPrice)} onChange={(e) => setMoney('renewalPrice', e.target.value)} className="input-dark" />
            </Field>
          </div>
          {def.fields.mockAttempts && (
            <Field label="Number of mock attempts">
              <input type="number" min={0} value={v.mockAttempts} onChange={(e) => onValue('mockAttempts', Number(e.target.value) || 0)} className="input-dark max-w-xs" />
            </Field>
          )}

          {def.fields.recommendedToggle && (
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={v.isRecommended} onChange={(e) => onValue('isRecommended', e.target.checked)} className="h-4 w-4" />
              Mark as Recommended
            </label>
          )}

          {id === 'complete' && (
            <div className="text-xs text-brand-ink">
              <div className="mb-1 font-medium">Combo saving off (Practice + Mock)</div>
              <ComboSavingField value={v.comboDiscount} onChange={(d) => onValue('comboDiscount', d)} />
            </div>
          )}

          <Field label="Learner-visible benefits (one per line)" hint="Leave blank to use the auto-generated list.">
            <textarea
              value={(v.benefitsOverride ?? benefits).join('\n')}
              onChange={(e) => onValue('benefitsOverride', e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
              rows={6}
              className="input-dark max-w-2xl"
            />
          </Field>
          <button type="button" onClick={() => onValue('benefitsOverride', null)} className="text-xs text-brand-ink hover:underline">
            Reset benefits to auto
          </button>
        </div>
      )}
    </div>
  );
}

// "What learners will see" - shown on the Packages step once packages exist,
// and its markup is intentionally close to the real learner card.
function LearnerPreview({ certification, packages }: { certification: CertificationAdminRow; packages: PackageAdminRow[] }) {
  const now = new Date();
  const sorted = [...packages].filter((p) => p.status !== 'archived').sort((a, b) => a.displayOrder - b.displayOrder);
  const recommended = sorted.find((p) => p.isRecommended) ?? sorted[0] ?? null;
  if (sorted.length === 0) return null;

  return (
    <div>
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-faint">What learners will see</h3>
      <div className="rounded-xl border border-surface-border bg-surface-raised p-5 shadow-card">
        <div className="text-xs uppercase tracking-wide text-ink-faint">{certification.provider}</div>
        <div className="text-lg font-semibold text-ink">{certification.name}</div>
        <p className="mt-1 max-w-2xl text-sm text-ink-faint">{certification.shortDescription || certification.description}</p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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

        <p className="mt-4 max-w-3xl border-t border-surface-border pt-3 text-[11px] leading-relaxed text-ink-faint">{certification.independentPrepDisclaimer}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4 - Publish
// ---------------------------------------------------------------------------

function StepPublish({
  certification,
  packages,
  onChanged,
  onExit,
  onBack,
}: {
  certification: CertificationAdminRow;
  packages: PackageAdminRow[];
  onChanged: () => void;
  onExit: () => void;
  onBack: () => void;
}) {
  const pushToast = useUiStore((s) => s.pushToast);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduledFor, setScheduledFor] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const { data: allTests } = useQuery({ queryKey: ['admin', 'practiceTests'], queryFn: contentAdminApi.listPracticeTestsAdmin });
  const { data: practiceDomains } = useQuery({
    queryKey: ['admin', 'bankDomainCounts', 'practiceTest', certification.practiceBankId],
    queryFn: () => contentAdminApi.getBankDomainCounts('practiceTest', certification.practiceBankId!),
    enabled: !!certification.practiceBankId && !certification.seriesId,
  });
  // For an uploaded set the eligible total is the whole document (every
  // practice batch), not just the first batch.
  const seriesTotal = (allTests?.practiceTests ?? [])
    .filter((t) => (certification.practiceBankIds ?? []).includes(t.id))
    .reduce((sum, t) => sum + (t.totalQuestions ?? 0), 0);
  const eligibleQuestions = certification.seriesId
    ? seriesTotal || null
    : practiceDomains?.totalQuestions ?? null;

  const sorted = [...packages].filter((p) => p.status !== 'archived').sort((a, b) => a.displayOrder - b.displayOrder);

  const blockers: string[] = [];
  const hasPracticeContent =
    !!certification.practiceBankId || !!certification.seriesId || (certification.practiceBankIds?.length ?? 0) > 0;
  if (!hasPracticeContent) blockers.push('Add questions in Step 2 (link a bank or upload a document).');
  for (const p of sorted) {
    const t = detectTemplate(p);
    if (!hasEntitlement(p.includedQuizIds, p.includedPracticeTestIds)) blockers.push(`${p.name}: connect it to a question bank (Step 2).`);
    if (!hasPublishablePrice(p.sellingPrice, p.isFree)) blockers.push(`Enter a price for ${p.name} (Step 3).`);
    if ((t === 'mock' || t === 'complete') && !certification.mockBankId) blockers.push('Generate or link a mock exam bank (Step 2).');
    if (eligibleQuestions != null && p.accessibleQuestionCount > eligibleQuestions) {
      blockers.push(`The bank has only ${eligibleQuestions.toLocaleString()} questions. Reduce ${p.name}'s question count.`);
    }
  }
  if (sorted.length === 0) blockers.push('Add at least one package in Step 3.');

  const publishMutation = useMutation({
    mutationFn: async (schedule: string | null) => {
      if (!certification.effectiveFrom && !schedule) {
        await contentAdminApi.updateCertification({ certificationId: certification.id, effectiveFrom: new Date().toISOString() });
      }
      await contentAdminApi.publishCertification(certification.id, schedule ? new Date(schedule).toISOString() : null);
      if (!schedule) {
        for (const p of sorted) {
          if (p.status !== 'published') await contentAdminApi.publishPackage(p.id);
        }
      }
    },
    onSuccess: (_data, schedule) => { pushToast(schedule ? 'Publication scheduled' : 'Published', 'success'); onChanged(); },
    onError: (err) => pushToast(cleanError(err, 'Could not publish'), 'error'),
  });

  const lifecycle = (fn: () => Promise<unknown>, msg: string) =>
    fn().then(() => { pushToast(msg, 'success'); onChanged(); }).catch((e) => pushToast(cleanError(e, 'Action failed'), 'error'));

  const { data: history } = useQuery({
    queryKey: ['admin', 'certAudit', certification.id],
    queryFn: () => contentAdminApi.getAuditHistoryForCertification(certification.id),
    enabled: showHistory,
  });

  const isLive = certification.status === 'published';
  const hasMock = !!certification.mockBankId || (certification.mockBankIds?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-ink-faint">Status:</span>
        <span className="rounded-full bg-brand-50 px-2 py-0.5 font-semibold capitalize text-brand-ink">{certification.status}</span>
      </div>

      {blockers.length > 0 && (
        <div className="rounded-lg border border-danger/40 bg-danger-soft p-3 text-sm text-danger">
          <div className="mb-1 font-semibold">Fix these before publishing:</div>
          <ul className="list-inside list-disc space-y-0.5">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
        </div>
      )}

      {/* Lifecycle actions - always visible, no hidden menu. */}
      <div className="rounded-xl border border-surface-border bg-surface-raised p-5">
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-faint">Manage</h3>
        <div className="flex flex-wrap gap-2">
          {isLive && (
            <button type="button" onClick={() => lifecycle(() => contentAdminApi.unpublishCertification(certification.id), 'Unpublished')} className="rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted">Unpublish</button>
          )}
          {certification.status === 'archived' ? (
            <button type="button" onClick={() => lifecycle(() => contentAdminApi.restoreCertification(certification.id), 'Restored to Draft')} className="rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted">Restore</button>
          ) : (
            <button type="button" onClick={async () => { if (await confirmDialog({ title: 'Archive this product?' })) lifecycle(() => contentAdminApi.archiveCertification(certification.id), 'Archived'); }} className="rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted hover:border-danger hover:text-danger">Archive</button>
          )}
          <button type="button" onClick={() => setShowHistory((h) => !h)} className="rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted">{showHistory ? 'Hide' : 'View'} history</button>
        </div>
        {showHistory && (
          <div className="mt-3 space-y-2">
            {(history?.entries ?? []).length === 0 && <p className="text-sm text-ink-faint">No history yet.</p>}
            {(history?.entries ?? []).map((entry: AuditLogEntry) => (
              <div key={entry.id} className="rounded-lg border border-surface-border p-3 text-xs">
                <div className="font-medium text-ink">{entry.description}</div>
                <div className="text-ink-faint">{toDate(entry.createdAt).toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Mock exam rules - visible, enabled only once mocks exist. */}
      <div className="rounded-xl border border-surface-border bg-surface-raised p-5">
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-faint">Mock exam rules (advanced)</h3>
        {hasMock && certification.contentVersions.length > 0 ? (
          <StepMockRules certificationId={certification.id} certification={certification} onChanged={onChanged} />
        ) : (
          <p className="text-sm text-ink-faint">Generate mock exams in Step 2 to configure their domain allocation and behaviour here.</p>
        )}
      </div>

      <p className="text-xs text-ink-faint">
        Completion certificates are issued automatically by the linked question bank(s) when a learner finishes a mock
        exam - there is no separate certificate setting. Learners view earned certificates on their My Certificates page;
        anyone can verify one at /verify/&lt;id&gt;.
      </p>

      {scheduleOpen && (
        <div className="rounded-xl border border-brand-500/30 bg-brand-50 p-4 dark:bg-brand-500/10">
          <Field label="Publish at">
            <input type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} className="input-dark max-w-xs" />
          </Field>
          <button
            type="button"
            disabled={!scheduledFor || blockers.length > 0 || publishMutation.isPending}
            onClick={() => publishMutation.mutate(scheduledFor)}
            className="mt-3 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Confirm schedule
          </button>
        </div>
      )}

      {/* Primary actions at the very end. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-border pt-5">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onBack} className="rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted hover:border-brand-400">← Back</button>
          <button type="button" onClick={onExit} className="rounded-lg border border-surface-border-strong px-4 py-2 text-sm font-medium text-ink-muted hover:border-brand-400">Save draft</button>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setScheduleOpen((s) => !s)}
            className="rounded-lg border border-brand-500 px-5 py-2.5 text-sm font-semibold text-brand-ink hover:bg-brand-50"
          >
            Schedule
          </button>
          <button
            type="button"
            disabled={blockers.length > 0 || publishMutation.isPending}
            onClick={async () => {
              if (await confirmDialog({ title: isLive ? 'Re-publish this product and its packages now?' : 'Publish this product and its packages now?' }))
                publishMutation.mutate(null);
            }}
            className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
          >
            {publishMutation.isPending ? 'Publishing…' : isLive ? 'Re-publish' : 'Publish'}
          </button>
        </div>
      </div>
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
      pushToast('Outline saved', 'success');
      setVersionName(''); setVersionCode(''); setBankId(''); setEffFrom(''); setEffTo(''); setNotes('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'certifications'] });
      onDirty();
    },
    onError: (err) => pushToast(cleanError(err, 'Could not save the outline'), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (versionId: string) => contentAdminApi.deleteContentVersion(certification.id, versionId),
    onSuccess: () => {
      pushToast('Outline removed', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'certifications'] });
    },
    onError: (err) => pushToast(cleanError(err, 'Could not remove the outline'), 'error'),
  });

  return (
    <details className="rounded-xl border border-surface-border bg-surface p-5">
      <summary className="cursor-pointer list-none text-sm font-medium text-brand-ink">Outline versions (advanced)</summary>
      <div className="mt-4">
        {certification.contentVersions.length === 0 ? (
          <p className="mb-4 text-sm text-ink-faint">None yet. One is created automatically when you generate or link a mock exam bank in Step 2.</p>
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
                <button type="button" onClick={() => deleteMutation.mutate(v.id)} className="rounded-md border border-danger/40 px-2 py-0.5 text-xs font-semibold text-danger hover:bg-danger-soft">Remove</button>
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          {saveMutation.isPending ? 'Saving…' : '+ Add outline version'}
        </button>
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Mock Rules (raw) - shown under Step 4. Total-questions / duration live in
// Step 2 (the mock batch size / duration), so they are not repeated here.
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

  const totalQuestions = existingBlueprint?.totalQuestions ?? 150;
  const durationMinutes = existingBlueprint?.durationMinutes ?? 240;
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
        totalQuestions,
        durationMinutes,
        difficultyDistribution: null,
        eligibleCountByDomain: domainCounts?.byDomain ?? {},
      }),
    [domains, totalQuestions, durationMinutes, domainCounts],
  );

  const autofill = () => {
    if (!domainCounts) return;
    const d = deriveMockBlueprint({ byDomain: domainCounts.byDomain, totalQuestions, durationMinutes });
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
        totalQuestions,
        durationMinutes,
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
      pushToast('Mock exam rules saved', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'certifications'] });
      onChanged();
    },
    onError: (err) => pushToast(cleanError(err, 'Could not save the mock exam rules'), 'error'),
  });

  return (
    <div className="space-y-5">
      {certification.contentVersions.length > 1 && (
        <Field label="Outline version">
          <select value={selectedVersionId} onChange={(e) => setSelectedVersionId(e.target.value)} className="input-dark">
            {certification.contentVersions.map((v) => <option key={v.id} value={v.id}>{v.versionName}</option>)}
          </select>
        </Field>
      )}

      <p className="text-xs text-ink-faint">
        Questions per mock ({totalQuestions}) and duration ({durationMinutes} min) come from Step 2.
      </p>

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
              <div className="flex items-center text-xs text-ink-faint">{domainCounts ? `${domainCounts.byDomain[d.domain] ?? 0} available` : 'N/A'}</div>
              <button type="button" onClick={() => removeDomainRow(i)} className="rounded-md border border-danger/40 px-2 py-0.5 text-xs font-semibold text-danger hover:bg-danger-soft">Remove</button>
            </div>
          ))}
          {domains.length === 0 && <p className="text-xs text-ink-faint">No domains yet. Use “Auto-fill from question bank”.</p>}
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

      {!validation.valid && domains.length > 0 && (
        <div className="rounded-lg border border-danger/40 bg-danger-soft p-3 text-sm text-danger">
          <ul className="list-inside list-disc space-y-0.5">{validation.errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}

      <button
        type="button"
        disabled={!validation.valid || saveMutation.isPending || domains.length === 0}
        onClick={() => saveMutation.mutate()}
        className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {saveMutation.isPending ? 'Saving…' : 'Save mock exam rules'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------

// Backend errors are worded for developers; surface something an admin can act on.
function cleanError(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : '';
  if (/slug/i.test(msg)) return 'That web address is already taken by another product - change the exam code or the slug in Step 1.';
  if (/unpublished certification cannot expose/i.test(msg)) return 'Publish the product before publishing its packages.';
  if (/no included quiz\/practice test|at least one quiz or practice test|valid entitlement/i.test(msg)) return 'Connect this package to a question bank first (Step 2).';
  if (/selling price/i.test(msg)) return 'Enter a price greater than zero, or mark the package Free.';
  if (/accessible question count|eligible/i.test(msg)) return msg.replace(/^[a-z]+: /i, '');
  if (/domain/i.test(msg)) return 'Mock domain allocation needs attention - open the mock exam rules on the Publish step.';
  return friendlyApiError(err, fallback);
}
