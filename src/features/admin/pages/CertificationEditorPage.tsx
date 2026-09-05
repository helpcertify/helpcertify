import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
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

// ===========================================================================
// One linear wizard - the SAME four steps for both "create" and "edit".
//   1 Basics      - name the product
//   2 Questions   - upload a document OR link existing banks
//   3 Packages    - which packages to sell, and their price
//   4 Publish     - preview and go live
// Every step shows only the few fields that matter; everything else is
// auto-filled and tucked behind a single "Adjust" / "More settings" toggle,
// so nothing the old editor could configure is lost.
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
const isoOrNull = (local: string | null | undefined): string | null => (local ? new Date(local).toISOString() : null);

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

  // Opened by id but the certification list hasn't resolved yet - hold
  // rather than flash the wizard with empty fields.
  if (params.certificationId && !certification) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-ink">Exam Preparation</h1>
        <p className="mt-6 text-sm text-ink-faint">{allCerts.length === 0 ? 'Loading…' : 'This exam preparation could not be found.'}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">
          {certification ? certification.name : 'New Exam Preparation'}
        </h1>
        <button type="button" onClick={cancelSafely} className="text-sm text-ink-faint hover:text-ink">
          Close
        </button>
      </div>
      <p className="mb-5 text-sm text-ink-faint">
        Four short steps. Everything technical is filled in for you - open “Adjust” only if you need to.
      </p>

      <Stepper current={step} onGo={goTo} unlocked={isNew ? 1 : 4} />

      <div className="mt-6">
        {step === 1 && (
          <StepBasics
            certification={certification}
            otherCerts={allCerts.filter((c) => c.id !== certificationId)}
            onDirty={() => setDirty(true)}
            onSaved={(id) => {
              setCertificationId(id);
              setDirty(false);
              invalidate();
              if (!params.certificationId) navigate(`/admin/products/${id}`, { replace: true });
              pushToast('Saved', 'success');
              goTo(2);
            }}
          />
        )}

        {step === 2 &&
          (certification ? (
            <StepQuestions
              certification={certification}
              onDirty={() => setDirty(true)}
              onSaved={() => {
                setDirty(false);
                invalidate();
                goTo(3);
              }}
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
              onSaved={() => {
                setDirty(false);
                invalidate();
                goTo(4);
              }}
              onBack={() => goTo(2)}
            />
          ) : (
            <LockedStep onBack={() => goTo(2)} />
          ))}

        {step === 4 &&
          (certification ? (
            <StepPublish certification={certification} packages={packages} onChanged={invalidate} onBack={() => goTo(3)} />
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

// A back button + optional primary, in one consistent spot at the bottom of
// every step.
function WizardFooter({
  onBack,
  primary,
}: {
  onBack?: () => void;
  primary?: { label: string; onClick: () => void; disabled?: boolean; busy?: boolean };
}) {
  return (
    <div className="mt-6 flex items-center justify-between gap-3">
      {onBack ? (
        <button type="button" onClick={onBack} className="rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted hover:border-brand-400">
          ← Back
        </button>
      ) : (
        <span />
      )}
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

// A single collapsible "Adjust" / "More settings" section. All the fields an
// admin rarely touches live inside one of these.
function Disclosure({ label, children, defaultOpen = false }: { label: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="rounded-lg border border-surface-border">
      <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-brand-ink">{label}</summary>
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

// ---------------------------------------------------------------------------
// Step 1 - Basics
// ---------------------------------------------------------------------------

function StepBasics({
  certification,
  otherCerts,
  onDirty,
  onSaved,
}: {
  certification: CertificationAdminRow | null;
  otherCerts: CertificationAdminRow[];
  onDirty: () => void;
  onSaved: (id: string) => void;
}) {
  const pushToast = useUiStore((s) => s.pushToast);

  const [shortName, setShortName] = useState(certification?.shortName ?? '');
  const [name, setName] = useState(certification?.name ?? '');
  const [nameTouched, setNameTouched] = useState(!!certification);
  const [provider, setProvider] = useState(certification?.provider ?? 'Other');
  const [shortDescription, setShortDescription] = useState(certification?.shortDescription ?? '');
  const [defaultValidityDays, setDefaultValidityDays] = useState(String(certification?.defaultValidityDays ?? 180));

  // "More settings"
  const [description, setDescription] = useState(certification?.description ?? '');
  const [featured, setFeatured] = useState(certification?.featured ?? false);
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

  // Name auto-fills from the exam code until the admin edits it directly.
  const effectiveName = nameTouched ? name : shortName ? `${shortName} Exam Preparation` : '';

  const autoSlug = useMemo(
    () => uniqueSlug(slugify(shortName || effectiveName), otherCerts.map((c) => c.slug)),
    [shortName, effectiveName, otherCerts],
  );
  const effectiveSlug = slugTouched && slug ? slug.trim().toLowerCase() : autoSlug;
  const effectiveCategory = category.trim() || provider;
  const effectiveIcon = iconTouched ? iconKey : iconForProvider(provider);
  const effectiveDisclaimer = disclaimerTouched ? disclaimer : buildDisclaimer(shortName, provider);
  const effectiveDisplayOrder = displayOrder !== '' ? Number(displayOrder) : nextDisplayOrder(otherCerts);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        shortName: shortName.trim(),
        name: effectiveName.trim(),
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
      };
      const id = certification
        ? await contentAdminApi.updateCertification({ certificationId: certification.id, ...payload }).then(() => certification.id)
        : await contentAdminApi.createCertification(payload).then((r) => r.certificationId);
      return id;
    },
    onSuccess: (id) => onSaved(id),
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
          <input
            value={effectiveName}
            onChange={(e) => { setName(e.target.value); setNameTouched(true); touched(); }}
            className="input-dark"
          />
        </Field>
        <Field label="Certification body" hint="e.g. ISACA">
          <CategorySelect value={provider} onChange={(v) => { setProvider(v); touched(); }} />
        </Field>
        <Field label="Short description" hint={`For the product card. ${shortDescription.length}/300`}>
          <textarea
            value={shortDescription}
            onChange={(e) => { setShortDescription(e.target.value.slice(0, 300)); touched(); }}
            maxLength={300}
            rows={2}
            className="input-dark"
            placeholder="Prepare with practice questions, realistic mock exams, detailed explanations and analytics."
          />
        </Field>
      </div>

      <Disclosure label="More settings (optional)">
        <div className="space-y-4">
          <Field label="Default access validity" hint="Starting point for each package - you can override it per package.">
            <ValiditySelect days={Number(defaultValidityDays) || 0} onChange={(d) => { setDefaultValidityDays(String(d)); touched(); }} />
          </Field>
          <Field label="Full description">
            <textarea value={description} onChange={(e) => { setDescription(e.target.value); touched(); }} rows={4} className="input-dark" />
          </Field>
          <Field label="Product icon" hint="Shown on the product card. Defaults to a match for the certification body.">
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

          <Disclosure label="Advanced (web address, ordering, dates, disclaimer)">
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Slug" hint={`The web address for this product. Auto: ${autoSlug}`}>
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
                <Field label="Effective from" hint="Blank = the publish date.">
                  <input type="datetime-local" value={effectiveFrom} onChange={(e) => { setEffectiveFrom(e.target.value); touched(); }} className="input-dark" />
                </Field>
                <Field label="Effective to" hint="Blank = no end date.">
                  <input type="datetime-local" value={effectiveTo} onChange={(e) => { setEffectiveTo(e.target.value); touched(); }} className="input-dark" />
                </Field>
              </div>
              <Field label="Independent-preparation disclaimer" hint="Auto-generated from the exam name and body.">
                <textarea
                  value={disclaimerTouched ? disclaimer : effectiveDisclaimer}
                  onChange={(e) => { setDisclaimer(e.target.value); setDisclaimerTouched(true); touched(); }}
                  rows={4}
                  className="input-dark"
                />
              </Field>
              {certification && <ContentVersionsPanel certification={certification} onDirty={onDirty} />}
            </div>
          </Disclosure>
        </div>
      </Disclosure>

      <WizardFooter
        primary={{
          label: 'Save & continue →',
          onClick: () => saveMutation.mutate(),
          disabled: !canSave,
          busy: saveMutation.isPending,
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
  onSaved,
  onBack,
}: {
  certification: CertificationAdminRow;
  onDirty: () => void;
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

  // Once content exists, show the summary and hide the pickers until the
  // admin clicks "Change".
  const [editing, setEditing] = useState(!hasContent);
  const [mode, setMode] = useState<'upload' | 'existing'>(certification.seriesId ? 'upload' : 'existing');

  const [practiceBankId, setPracticeBankId] = useState(certification.practiceBankId ?? '');
  const [mockBankId, setMockBankId] = useState(certification.mockBankId ?? '');

  const practiceBanks = tests?.practiceTests ?? [];
  const quizBanks = (quizzes?.quizzes ?? []).filter((q) => q.isPublished);
  const practiceBankList = practiceBanks.filter((t) => practiceBankIds.includes(t.id));
  const practiceQuestionTotal = practiceBankList.reduce((sum, t) => sum + (t.totalQuestions ?? 0), 0);
  const mockBank = quizBanks.find((q) => q.id === certification.mockBankId) ?? null;
  const mockCount = (quizzes?.quizzes ?? []).filter((q) => (certification.mockBankIds ?? []).includes(q.id)).length
    || (certification.mockBankId ? 1 : 0);

  const linkBanks = useMutation({
    mutationFn: async () => {
      await contentAdminApi.updateCertification({
        certificationId: certification.id,
        practiceBankId: practiceBankId || null,
        mockBankId: mockBankId || null,
      });
      // Auto-create the single content version the mock rules hang off, the
      // first time a mock bank is chosen.
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'certifications'] });
      onSaved();
    },
    onError: (err) => pushToast(cleanError(err, 'Could not link the question banks'), 'error'),
  });

  // Content already attached and not editing - compact summary + Continue.
  if (hasContent && !editing) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-success/40 bg-success-soft p-4 text-sm">
          <div className="font-semibold text-ink">Questions are ready</div>
          <div className="mt-1 text-ink-muted">
            {(certification.seriesId ? practiceQuestionTotal : practiceBankList[0]?.totalQuestions ?? 0).toLocaleString()} practice questions
            {certification.seriesId ? ` · ${practiceBankList.length} practice batches` : ''}
            {mockCount > 0 ? ` · ${mockCount} mock exam${mockCount === 1 ? '' : 's'}` : mockBank ? ' · 1 mock exam bank' : ''}
          </div>
          <button type="button" onClick={() => setEditing(true)} className="mt-2 text-xs font-semibold text-brand-ink hover:underline">
            Change
          </button>
        </div>
        <WizardFooter onBack={onBack} primary={{ label: 'Continue →', onClick: onSaved }} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-lg border border-surface-border p-0.5 text-sm">
        <button
          type="button"
          onClick={() => setMode('upload')}
          className={`rounded-md px-4 py-1.5 font-medium ${mode === 'upload' ? 'bg-brand-500 text-white' : 'text-ink-muted hover:text-ink'}`}
        >
          Upload a document
        </button>
        <button
          type="button"
          onClick={() => setMode('existing')}
          className={`rounded-md px-4 py-1.5 font-medium ${mode === 'existing' ? 'bg-brand-500 text-white' : 'text-ink-muted hover:text-ink'}`}
        >
          Use existing banks
        </button>
      </div>

      {mode === 'upload' ? (
        <>
          <BatchedSeriesPanel
            certificationId={certification.id}
            canCreate
            examName={certification.shortName || certification.name}
            category={certification.category || certification.provider}
            currentSeriesId={certification.seriesId ?? null}
            onGenerated={() => {
              queryClient.invalidateQueries({ queryKey: ['admin', 'certifications'] });
              queryClient.invalidateQueries({ queryKey: ['admin', 'practiceTests'] });
              queryClient.invalidateQueries({ queryKey: ['admin', 'quizzes'] });
              onDirty();
              setEditing(false);
            }}
          />
          <WizardFooter onBack={onBack} primary={hasContent ? { label: 'Continue →', onClick: onSaved } : undefined} />
        </>
      ) : (
        <>
          <Field label="Practice question bank" hint="Your Practice and Complete packages draw from this.">
            <select value={practiceBankId} onChange={(e) => { setPracticeBankId(e.target.value); onDirty(); }} className="input-dark">
              <option value="">Select a question bank…</option>
              {practiceBanks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title} - {b.totalQuestions.toLocaleString()} questions
                </option>
              ))}
            </select>
          </Field>
          <Field label="Mock exam question bank (optional)" hint="Only needed if you will sell Mock Exams or Complete Preparation.">
            <select value={mockBankId} onChange={(e) => { setMockBankId(e.target.value); onDirty(); }} className="input-dark">
              <option value="">Not set</option>
              {quizBanks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title} - {b.totalQuestions.toLocaleString()} questions
                </option>
              ))}
            </select>
          </Field>
          <WizardFooter
            onBack={onBack}
            primary={{
              label: 'Save & continue →',
              onClick: () => linkBanks.mutate(),
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
  certificationId,
  canCreate,
  examName,
  category,
  currentSeriesId,
  onGenerated,
}: {
  certificationId: string;
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
      setUploading(true);
      try {
        const fileUrl = await uploadContentFile(file);
        return await contentAdminApi.createBatchedSeries({
          certificationId,
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
        <h3 className="text-sm font-bold text-ink">Upload one question document</h3>
        <button
          type="button"
          onClick={() => downloadTemplate(sourceFormat)}
          className="shrink-0 rounded-lg border border-brand-500 px-2.5 py-1 text-xs text-brand-ink hover:opacity-80"
        >
          ↓ Template
        </button>
      </div>
      <p className="mt-1 text-xs text-ink-muted">
        We split it into practice exam batches (no repeats, every question covered) plus fixed mock exams that shuffle on
        every attempt. Learners unlock these by buying a package. The document must match the template above.
      </p>
      {currentSeriesId && (
        <p className="mt-2 rounded-lg bg-surface-raised px-3 py-2 text-xs text-ink-muted">
          A set is already linked. Generating again replaces it with a new set of batches.
        </p>
      )}
      <div className="mt-3 space-y-3">
        <Field label="Question document">
          <input type="file" accept=".docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm text-ink" />
        </Field>

        <details className="rounded-lg border border-brand-500/30">
          <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-brand-ink">
            Adjust batch settings: {sourceFormat === 'standard' ? 'Standard' : 'CISA Q&A'} · {practiceBatchSize}/practice batch · {mockCount} mocks x {mockBatchSize} Q · {mockDurationMinutes} min · {passMarkPercent}% pass
          </summary>
          <div className="grid grid-cols-1 gap-3 border-t border-brand-500/30 p-3 sm:grid-cols-2">
            <Field label="Source format">
              <select value={sourceFormat} onChange={(e) => setSourceFormat(e.target.value as 'standard' | 'cisa_qa')} className="input-dark">
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
        </details>

        <button
          type="button"
          disabled={!file || !canCreate || gen.isPending || uploading}
          onClick={() => gen.mutate()}
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {uploading ? 'Uploading...' : gen.isPending ? 'Generating...' : 'Generate'}
        </button>
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
  onSaved,
  onBack,
}: {
  certification: CertificationAdminRow;
  packages: PackageAdminRow[];
  onDirty: () => void;
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

  const saveAll = useMutation({
    mutationFn: async () => {
      for (const id of TEMPLATE_ORDER) {
        const card = cards[id];
        const existing = templatePackages[id];
        if (card.enabled) {
          const v: TemplateValues = { ...card.values, offerStart: isoOrNull(card.values.offerStart), offerEnd: isoOrNull(card.values.offerEnd) };
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
        } else if (existing && existing.status === 'draft') {
          await contentAdminApi.deletePackage(existing.id);
        }
      }
    },
    onSuccess: () => { pushToast('Packages saved', 'success'); onSaved(); },
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
          eligiblePracticeQuestions={eligiblePracticeQuestions === Number.MAX_SAFE_INTEGER ? 0 : eligiblePracticeQuestions}
          partsSellingMinor={partsSelling}
          onToggle={(enabled) => setCard(id, { enabled })}
          onValue={(k, val) => setValue(id, k, val)}
        />
      ))}

      <PackageList packages={packages} onChanged={onSaved} />

      <Disclosure label="Add a custom package (advanced)">
        <CustomPackageForm certificationId={certification.id} onChanged={onSaved} />
      </Disclosure>

      <WizardFooter
        onBack={onBack}
        primary={{
          label: 'Save & continue →',
          onClick: () => saveAll.mutate(),
          disabled: !anyEnabled || anyPriceBad || noContent,
          busy: saveAll.isPending,
        }}
      />
    </div>
  );
}

function TemplateCard({
  id,
  state,
  certification,
  eligiblePracticeQuestions,
  partsSellingMinor,
  onToggle,
  onValue,
}: {
  id: TemplateId;
  state: CardState;
  certification: CertificationAdminRow;
  eligiblePracticeQuestions: number;
  partsSellingMinor: number;
  onToggle: (enabled: boolean) => void;
  onValue: <K extends keyof TemplateValues>(key: K, value: TemplateValues[K]) => void;
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
  const priceBad = state.enabled && !hasPublishablePrice(v.sellingPrice, false);

  const questions = eligiblePracticeQuestions > 0 ? eligiblePracticeQuestions : v.numberOfQuestions;
  const autoLine = [
    `${v.validityDays} days access`,
    (id === 'practice' || id === 'complete') && questions ? `${questions.toLocaleString()} questions` : null,
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
              Set a mock exam question bank in Step 2 to publish this package.
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Price (₹)">
              <input type="number" min={0} value={money(v.sellingPrice) || ''} onChange={(e) => setMoney('sellingPrice', e.target.value)} className="input-dark" />
            </Field>
            <div className="flex items-end pb-2 text-xs text-ink-faint">{autoLine}</div>
          </div>

          {id === 'complete' && (
            <p className="rounded-lg border border-brand-500/30 bg-brand-50 p-3 text-xs text-brand-ink dark:bg-brand-500/10">
              Auto-priced as Practice + Mock (₹{minorToMajor(partsSellingMinor)}) minus any combo saving (set under Adjust),
              until you type a price above.
            </p>
          )}

          <Disclosure label="Adjust">
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Regular price (₹, optional)" hint="Shown struck-through as the 'was' price.">
                  <input type="number" min={0} value={money(v.regularPrice)} onChange={(e) => setMoney('regularPrice', e.target.value)} className="input-dark" />
                </Field>
                <Field label="Access validity">
                  <ValiditySelect days={v.validityDays} onChange={(d) => onValue('validityDays', d)} />
                </Field>
                {def.fields.numberOfQuestions && (
                  <Field label="Number of questions" hint={eligiblePracticeQuestions ? `Bank has ${eligiblePracticeQuestions.toLocaleString()}` : undefined}>
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

              {id === 'complete' && (
                <div className="text-xs text-brand-ink">
                  <div className="mb-1 font-medium">Combo saving off (Practice + Mock)</div>
                  <ComboSavingField value={v.comboDiscount} onChange={(d) => onValue('comboDiscount', d)} />
                </div>
              )}

              {(id === 'mock' || id === 'complete') && certification.mockBankId && (
                <MockConfigStatusChip certification={certification} questionsPerMock={v.questionsPerMock} durationMinutes={v.durationMinutes} />
              )}

              <Field label="Learner-visible benefits (one per line)" hint="Leave blank to use the auto-generated list.">
                <textarea
                  value={(v.benefitsOverride ?? benefits).join('\n')}
                  onChange={(e) => onValue('benefitsOverride', e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
                  rows={6}
                  className="input-dark"
                />
              </Field>
              <button type="button" onClick={() => onValue('benefitsOverride', null)} className="text-xs text-brand-ink hover:underline">
                Reset benefits to auto
              </button>

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
              <p className="text-xs text-ink-faint">
                Tax treatment, promo / referral / refund eligibility and upgrades use safe platform defaults (tax-inclusive,
                all eligible). Use “Add a custom package” to change them.
              </p>
            </div>
          </Disclosure>

          {(offerBad || priceBad) && (
            <p className="text-sm text-danger">
              {priceBad && 'Enter a price greater than zero. '}
              {offerBad && 'Check the offer price and offer period.'}
            </p>
          )}
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
    <div className={`rounded-lg border p-3 text-sm ${status === 'ready' ? 'border-success/40 bg-success-soft text-success' : 'border-warning/40 bg-warning-soft text-warning'}`}>
      {status === 'ready'
        ? 'Mock exam rules ready - domain allocation derived from the question bank.'
        : 'Mock exam rules need attention - add domain tags to the mock question bank, or set the allocation under Step 4 › More options.'}
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
              <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${pkg.status === 'published' ? 'bg-success-soft text-success' : 'bg-surface-sunken text-ink-faint'}`}>{pkg.status}</span>
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
// Step 4 - Publish
// ---------------------------------------------------------------------------

function StepPublish({
  certification,
  packages,
  onChanged,
  onBack,
}: {
  certification: CertificationAdminRow;
  packages: PackageAdminRow[];
  onChanged: () => void;
  onBack: () => void;
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
  if (!hasPracticeContent) blockers.push('Add questions in Step 2 (link a bank or upload a document).');
  for (const p of sorted) {
    const t = detectTemplate(p);
    const label = p.name;
    if (!hasEntitlement(p.includedQuizIds, p.includedPracticeTestIds)) blockers.push(`${label}: connect it to a question bank (Step 2).`);
    if (!hasPublishablePrice(p.sellingPrice, p.isFree)) blockers.push(`Enter a price for ${label} (Step 3).`);
    if ((t === 'mock' || t === 'complete') && !certification.mockBankId) blockers.push('Select a mock exam question bank (Step 2).');
    if (eligibleQuestions != null && p.accessibleQuestionCount > eligibleQuestions) {
      blockers.push(`The bank has only ${eligibleQuestions.toLocaleString()} questions. Reduce ${label}'s question count.`);
    }
  }
  if (sorted.length === 0) blockers.push('Add at least one package in Step 3.');

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
    onSuccess: () => { pushToast(scheduledFor ? 'Publication scheduled' : 'Published', 'success'); onChanged(); },
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

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-faint">What learners will see</h3>
        <div className="rounded-xl border border-surface-border bg-surface-raised p-5 shadow-card">
          <div className="text-xs uppercase tracking-wide text-ink-faint">{certification.provider}</div>
          <div className="text-lg font-semibold text-ink">{certification.name}</div>
          <p className="mt-1 text-sm text-ink-faint">{certification.shortDescription || certification.description}</p>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
        <div className="rounded-lg border border-danger/40 bg-danger-soft p-3 text-sm text-danger">
          <div className="mb-1 font-semibold">Fix these before publishing:</div>
          <ul className="list-inside list-disc space-y-0.5">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
        </div>
      )}

      <div className="rounded-xl border border-surface-border bg-surface-raised p-5">
        <div className="mb-4 flex items-center gap-2 text-sm">
          <span className="text-ink-faint">Status:</span>
          <span className="rounded-full bg-brand-50 px-2 py-0.5 font-semibold capitalize text-brand-ink">{certification.status}</span>
        </div>
        <button
          type="button"
          disabled={blockers.length > 0 || publishMutation.isPending}
          onClick={async () => {
            if (await confirmDialog({ title: isLive ? 'Re-publish this product and its packages now?' : 'Publish this product and its packages now?' }))
              publishMutation.mutate();
          }}
          className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
        >
          {publishMutation.isPending ? 'Publishing…' : isLive ? 'Re-publish' : 'Publish'}
        </button>

        <div className="mt-4">
          <Disclosure label="More options">
            <div className="space-y-4">
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
                {isLive && (
                  <button type="button" onClick={() => lifecycle(() => contentAdminApi.unpublishCertification(certification.id), 'Unpublished')} className="rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted">Unpublish</button>
                )}
                {certification.status === 'archived' ? (
                  <button type="button" onClick={() => lifecycle(() => contentAdminApi.restoreCertification(certification.id), 'Restored to Draft')} className="rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted">Restore</button>
                ) : (
                  <button type="button" onClick={async () => { if (await confirmDialog({ title: 'Archive this product?' })) lifecycle(() => contentAdminApi.archiveCertification(certification.id), 'Archived'); }} className="rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted hover:border-danger hover:text-danger">Archive</button>
                )}
                <button type="button" onClick={() => setShowHistory((v) => !v)} className="rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted">{showHistory ? 'Hide' : 'View'} history</button>
              </div>

              {showHistory && (
                <div className="space-y-2">
                  {(history?.entries ?? []).length === 0 && <p className="text-sm text-ink-faint">No history yet.</p>}
                  {(history?.entries ?? []).map((entry: AuditLogEntry) => (
                    <div key={entry.id} className="rounded-lg border border-surface-border p-3 text-xs">
                      <div className="font-medium text-ink">{entry.description}</div>
                      <div className="text-ink-faint">{toDate(entry.createdAt).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              )}

              {certification.contentVersions.length > 0 && (
                <Disclosure label="Mock exam rules (advanced)">
                  <StepMockRules certificationId={certification.id} certification={certification} onChanged={onChanged} />
                </Disclosure>
              )}

              <p className="text-xs text-ink-faint">
                Completion certificates are issued automatically by the linked question bank(s) when a learner finishes a
                mock exam - there is no separate certificate setting. Learners view earned certificates on their My
                Certificates page; anyone can verify one at /verify/&lt;id&gt;.
              </p>
            </div>
          </Disclosure>
        </div>
      </div>

      <WizardFooter onBack={onBack} />
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
    <div className="rounded-xl border border-surface-border bg-surface p-5">
      <h3 className="mb-3 font-medium text-ink">Outline versions (advanced)</h3>
      {certification.contentVersions.length === 0 ? (
        <p className="mb-4 text-sm text-ink-faint">None yet. One is created automatically when you set a mock exam question bank in Step 2.</p>
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
  );
}

// ---------------------------------------------------------------------------
// Mock Rules (raw) - reused under Step 4 › More options
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
      pushToast('Mock exam rules saved', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'certifications'] });
      onChanged();
    },
    onError: (err) => pushToast(cleanError(err, 'Could not save the mock exam rules'), 'error'),
  });

  if (certification.contentVersions.length === 0) {
    return <p className="text-sm text-ink-faint">Set a mock exam question bank in Step 2 first.</p>;
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
  if (/slug/i.test(msg)) return 'That web address is already taken by another product - change the exam code or set a different slug in Step 1 › More settings.';
  if (/unpublished certification cannot expose/i.test(msg)) return 'Publish the product before publishing its packages.';
  if (/no included quiz\/practice test|at least one quiz or practice test|valid entitlement/i.test(msg)) return 'Connect this package to a question bank first (Step 2).';
  if (/selling price/i.test(msg)) return 'Enter a price greater than zero, or mark the package Free.';
  if (/accessible question count|eligible/i.test(msg)) return msg.replace(/^[a-z]+: /i, '');
  if (/domain/i.test(msg)) return 'Mock domain allocation needs attention - open Step 4 › More options › Mock exam rules.';
  return friendlyApiError(err, fallback);
}
