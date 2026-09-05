import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  adminApi,
  FEATURE_KEYS,
  BUILTIN_CATEGORY_KEYS,
  BUILTIN_CATEGORY_LABELS,
  type AppSettings,
  type CompanyInfoSettings,
  type FeatureAccessEntry,
  type FeatureKey,
  type RewardType,
} from '../api/adminApi';
import { contentAdminApi } from '../api/contentAdminApi';
import { useUiStore } from '@/store/useUiStore';
import { majorToMinor, minorToMajor } from '@/utils/currency';
import { COMPANY } from '@/features/marketing/companyInfo';
import { errorText } from '@/lib/errorMessages';

// The admin portal's one settings screen - OTP toggles, plus (below) the
// Refer & Earn reward/eligibility controls. One combined Save Changes
// button, matching api/admin.ts's updateAppSettingsSchema, which takes
// every field together rather than supporting a partial update.
export function AdminSettingsPage() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const { data } = useQuery({ queryKey: ['admin', 'appSettings'], queryFn: adminApi.getAppSettings });
  const { data: quizzesData } = useQuery({ queryKey: ['admin', 'quizzes'], queryFn: contentAdminApi.listQuizzesAdmin });
  const { data: practiceTestsData } = useQuery({ queryKey: ['admin', 'practiceTests'], queryFn: contentAdminApi.listPracticeTestsAdmin });
  const [emailOtpEnabled, setEmailOtpEnabled] = useState(false);
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);

  // Refer & Earn - every amount is typed in rupees (converted to/from
  // paise only at the load/save boundary, never stored as a raw
  // major-unit number), matching how every other price field in the admin
  // already works (see PracticeTestFormCard's own price input). The
  // referrer's reward is always a flat credit amount (no percent option -
  // see CreditLedgerEntryDoc's own comment on why); the referee's stays a
  // coupon, flat or percent.
  const [creditAmount, setCreditAmount] = useState('');
  const [validationDays, setValidationDays] = useState('');
  const [creditExpiryDays, setCreditExpiryDays] = useState('');
  const [monthlyLimit, setMonthlyLimit] = useState('');
  const [creditMaxPercent, setCreditMaxPercent] = useState('');
  const [eligibleItemIds, setEligibleItemIds] = useState<string[]>([]);
  const [refereeType, setRefereeType] = useState<RewardType>('percent');
  const [refereeValue, setRefereeValue] = useState('');

  useEffect(() => {
    if (!data) return;
    setEmailOtpEnabled(data.emailOtpEnabled);
    setDarkModeEnabled(data.darkModeEnabled);
    setCreditAmount(String(minorToMajor(data.referralCreditAmountMinor)));
    setValidationDays(String(data.referralValidationPeriodDays));
    setCreditExpiryDays(String(data.referralCreditExpiryDays));
    setMonthlyLimit(String(data.referralMonthlyLimit));
    setCreditMaxPercent(String(data.referralCreditMaxPercent));
    setEligibleItemIds(data.referralEligibleItemIds);
    setRefereeType(data.refereeRewardType);
    setRefereeValue(data.refereeRewardType === 'flat' ? String(minorToMajor(data.refereeRewardValue)) : String(data.refereeRewardValue));
  }, [data]);

  const buildPayload = (): AppSettings => ({
    emailOtpEnabled,
    darkModeEnabled,
    mobileOtpEnabled: false,
    referralCreditAmountMinor: majorToMinor(Number(creditAmount) || 0),
    referralValidationPeriodDays: Math.round(Number(validationDays) || 0),
    referralCreditExpiryDays: Math.round(Number(creditExpiryDays) || 0),
    referralMonthlyLimit: Math.round(Number(monthlyLimit) || 0),
    referralCreditMaxPercent: Math.round(Number(creditMaxPercent) || 0),
    referralEligibleItemIds: eligibleItemIds,
    refereeRewardType: refereeType,
    refereeRewardValue: refereeType === 'flat' ? majorToMinor(Number(refereeValue) || 0) : Math.round(Number(refereeValue) || 0),
  });

  const saveMutation = useMutation({
    mutationFn: () => adminApi.updateAppSettings(buildPayload()),
    onSuccess: () => {
      queryClient.setQueryData(['admin', 'appSettings'], buildPayload());
      pushToast('Settings saved', 'success');
    },
    onError: (err) => pushToast(errorText(err, 'Could not save settings'), 'error'),
  });

  const payload = buildPayload();
  const dirty =
    data !== undefined &&
    (payload.emailOtpEnabled !== data.emailOtpEnabled ||
      payload.darkModeEnabled !== data.darkModeEnabled ||
      payload.referralCreditAmountMinor !== data.referralCreditAmountMinor ||
      payload.referralValidationPeriodDays !== data.referralValidationPeriodDays ||
      payload.referralCreditExpiryDays !== data.referralCreditExpiryDays ||
      payload.referralMonthlyLimit !== data.referralMonthlyLimit ||
      payload.referralCreditMaxPercent !== data.referralCreditMaxPercent ||
      payload.referralEligibleItemIds.join(',') !== data.referralEligibleItemIds.join(',') ||
      payload.refereeRewardType !== data.refereeRewardType ||
      payload.refereeRewardValue !== data.refereeRewardValue);

  const toggleEligibleItem = (itemId: string) => {
    setEligibleItemIds((ids) => (ids.includes(itemId) ? ids.filter((id) => id !== itemId) : [...ids, itemId]));
  };

  const allItems = [
    ...(quizzesData?.quizzes ?? []).map((q) => ({ id: q.id, title: q.title, kind: 'Mock Exam' })),
    ...(practiceTestsData?.practiceTests ?? []).map((t) => ({ id: t.id, title: t.title, kind: 'Practice Test' })),
  ];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-ink">Settings</h1>
      <p className="mb-6 text-sm text-ink-faint">
        Company &amp; contact details, registration, account-verification, and Refer &amp; Earn options.
      </p>

      <div className="max-w-xl space-y-6">
        <CompanyDetailsCard />
        <CustomExamBuilderSettingsCard />
        <FeatureAccessCard />

        <div className="rounded-xl border border-surface-border bg-surface-raised p-6">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-ink-faint">Appearance</h2>

          <label className="flex items-start gap-3 rounded-lg border border-surface-border p-4">
            <input
              type="checkbox"
              checked={darkModeEnabled}
              onChange={(e) => setDarkModeEnabled(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              <span className="block font-medium text-ink">Enable dark mode</span>
              <span className="block text-sm text-ink-faint">
                When on, every student and admin gets a light/dark switch (in Settings, and in the
                admin header) and their choice is remembered per device. When off, the whole app is
                light only and no switch is shown anywhere. Takes effect on each person's next page
                load.
              </span>
            </span>
          </label>
        </div>

        <div className="rounded-xl border border-surface-border bg-surface-raised p-6">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-ink-faint">OTP Verification</h2>

          <label className="flex items-start gap-3 rounded-lg border border-surface-border p-4">
            <input
              type="checkbox"
              checked={emailOtpEnabled}
              onChange={(e) => setEmailOtpEnabled(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              <span className="block font-medium text-ink">Email OTP verification</span>
              <span className="block text-sm text-ink-faint">
                New students must enter a code emailed to them before they can use their account.
              </span>
            </span>
          </label>

          <label className="mt-3 flex items-start gap-3 rounded-lg border border-surface-border p-4 opacity-60">
            <input type="checkbox" checked={false} disabled className="mt-0.5 h-4 w-4" />
            <span>
              <span className="flex items-center gap-2 font-medium text-ink">
                Mobile OTP verification
                <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs font-normal text-ink-faint">
                  Coming soon
                </span>
              </span>
              <span className="block text-sm text-ink-faint">
                Requires an SMS provider to be connected first.
              </span>
            </span>
          </label>
        </div>

        <div className="rounded-xl border border-surface-border bg-surface-raised p-6">
          <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-ink-faint">🎁 Refer &amp; Earn</h2>
          <p className="mb-4 text-sm text-ink-faint">
            Only applies to referrals created after you save. An already-granted reward keeps the amount it was
            promised at the time.
          </p>

          <div className="mb-4">
            <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-faint">
              Referrer credit (granted once their referral makes a first eligible purchase, non-withdrawable)
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-ink-faint">₹</span>
              <input
                type="number"
                min={1}
                value={creditAmount}
                onChange={(e) => setCreditAmount(e.target.value)}
                placeholder="e.g. 250"
                className="input-dark flex-1"
              />
            </div>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-4">
            <div>
              <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-faint">Validation period (days)</div>
              <input
                type="number"
                min={0}
                value={validationDays}
                onChange={(e) => setValidationDays(e.target.value)}
                placeholder="e.g. 7"
                className="input-dark"
              />
            </div>
            <div>
              <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-faint">Credit expires after (days)</div>
              <input
                type="number"
                min={1}
                value={creditExpiryDays}
                onChange={(e) => setCreditExpiryDays(e.target.value)}
                placeholder="e.g. 90"
                className="input-dark"
              />
            </div>
            <div>
              <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-faint">Max rewarded referrals / month</div>
              <input
                type="number"
                min={1}
                value={monthlyLimit}
                onChange={(e) => setMonthlyLimit(e.target.value)}
                placeholder="e.g. 10"
                className="input-dark"
              />
            </div>
            <div>
              <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-faint">Credit covers up to (% of order)</div>
              <input
                type="number"
                min={1}
                max={100}
                value={creditMaxPercent}
                onChange={(e) => setCreditMaxPercent(e.target.value)}
                placeholder="e.g. 25"
                className="input-dark"
              />
            </div>
          </div>

          <div className="mb-4">
            <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-faint">
              Referee reward (a coupon, granted immediately at signup)
            </div>
            <div className="flex gap-2">
              <select
                value={refereeType}
                onChange={(e) => setRefereeType(e.target.value as RewardType)}
                className="input-dark w-32"
              >
                <option value="flat">Flat ₹</option>
                <option value="percent">Percent %</option>
              </select>
              <input
                type="number"
                min={1}
                max={refereeType === 'percent' ? 95 : undefined}
                value={refereeValue}
                onChange={(e) => setRefereeValue(e.target.value)}
                placeholder={refereeType === 'flat' ? 'e.g. 200' : 'e.g. 10'}
                className="input-dark flex-1"
              />
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-faint">
              Eligible products {eligibleItemIds.length === 0 && '(none selected = every paid item is eligible)'}
            </div>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-surface-border p-2">
              {allItems.length === 0 ? (
                <p className="p-2 text-sm text-ink-faint">No published quizzes or practice tests yet.</p>
              ) : (
                allItems.map((item) => (
                  <label key={item.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-surface">
                    <input
                      type="checkbox"
                      checked={eligibleItemIds.includes(item.id)}
                      onChange={() => toggleEligibleItem(item.id)}
                      className="h-4 w-4"
                    />
                    <span className="text-ink">{item.title}</span>
                    <span className="text-xs text-ink-faint">{item.kind}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          disabled={!dirty || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
          className="rounded-lg bg-[#155EEF] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saveMutation.isPending ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

// Company / contact details shown on the public marketing & legal pages
// (Terms, Refund, Support, Privacy, Contact) and the checkout consent
// links. Stored in appSettings/company; a blank field falls back to the
// compile-time default in src/features/marketing/companyInfo.ts. Its own
// query + save, independent of the OTP / Refer & Earn settings below.
const COMPANY_FIELDS: { key: keyof CompanyInfoSettings; label: string; placeholder: string; wide?: boolean }[] = [
  { key: 'operatorName', label: 'Operating entity name', placeholder: COMPANY.operatorName },
  { key: 'operatorType', label: 'Entity type / constitution', placeholder: COMPANY.operatorType },
  { key: 'operatorCountry', label: 'Country', placeholder: COMPANY.operatorCountry },
  { key: 'registeredAddress', label: 'Registered address', placeholder: COMPANY.registeredAddress, wide: true },
  { key: 'jurisdiction', label: 'Governing-law venue (courts)', placeholder: COMPANY.jurisdiction },
  { key: 'contactEmail', label: 'Support / contact email', placeholder: COMPANY.contactEmail },
  { key: 'contactPhone', label: 'Contact phone (blank = hidden)', placeholder: '+91 …' },
  { key: 'grievanceEmail', label: 'Refund / billing / grievance email', placeholder: COMPANY.grievanceEmail },
  { key: 'grievanceOfficer', label: 'Grievance officer name (blank = hidden)', placeholder: 'Full name' },
  { key: 'grievanceOfficerTitle', label: 'Grievance officer designation', placeholder: COMPANY.grievanceOfficerTitle },
  { key: 'gstin', label: 'GSTIN (blank = "not registered for GST")', placeholder: '22AAAAA0000A1Z5' },
  { key: 'udyamNumber', label: 'Udyam / MSME registration no. (blank = hidden)', placeholder: 'UDYAM-XX-00-0000000' },
];

const EMPTY_COMPANY: CompanyInfoSettings = {
  operatorName: '', operatorType: '', operatorCountry: '', registeredAddress: '', jurisdiction: '',
  contactEmail: '', contactPhone: '', grievanceEmail: '', grievanceOfficer: '',
  grievanceOfficerTitle: '', gstin: '', udyamNumber: '',
};

// Price and availability for the "Bring Your Own Question Bank" add-on
// (see api/checkout.ts's createOrder and api/content-admin.ts's
// createCustomExamSet). Price is typed in rupees, same convention as every
// other price field in the admin (see PracticeTestFormCard) - converted
// to/from paise only at the load/save boundary.
function CustomExamBuilderSettingsCard() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const { data } = useQuery({ queryKey: ['admin', 'customExamBuilderSettings'], queryFn: adminApi.getCustomExamBuilderSettings });
  const [priceInput, setPriceInput] = useState('');
  const [originalPriceInput, setOriginalPriceInput] = useState('');
  const [currency, setCurrency] = useState<'INR' | 'USD'>('INR');
  const [isEnabled, setIsEnabled] = useState(true);

  useEffect(() => {
    if (data) {
      setPriceInput(String(minorToMajor(data.priceMinor)));
      setOriginalPriceInput(data.originalPriceMinor != null ? String(minorToMajor(data.originalPriceMinor)) : '');
      setCurrency(data.currency);
      setIsEnabled(data.isEnabled);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      adminApi.updateCustomExamBuilderSettings({
        priceMinor: majorToMinor(Number(priceInput) || 0),
        originalPriceMinor: originalPriceInput.trim() === '' ? null : majorToMinor(Number(originalPriceInput) || 0),
        currency,
        isEnabled,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'customExamBuilderSettings'] });
      pushToast('Custom Exam Builder settings saved.', 'success');
    },
    onError: (err) => pushToast(errorText(err, 'Could not save these settings'), 'error'),
  });

  return (
    <div className="rounded-xl border border-surface-border bg-surface-raised p-6">
      <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-ink-faint">Custom Exam Builder</h2>
      <p className="mb-4 text-sm text-ink-faint">
        The "Bring Your Own Question Bank" add-on: a one-time purchase that lets a student upload
        their own question bank. Disabling it blocks new purchases immediately without affecting
        students who already bought it.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-faint">
            Selling price (what's charged)
          </label>
          <input
            type="number"
            min={0}
            value={priceInput}
            onChange={(e) => setPriceInput(e.target.value)}
            className="input-dark w-full"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-faint">
            Original price (optional, shown struck through)
          </label>
          <input
            type="number"
            min={0}
            value={originalPriceInput}
            onChange={(e) => setOriginalPriceInput(e.target.value)}
            placeholder="No offer badge"
            className="input-dark w-full"
          />
        </div>
      </div>
      <p className="mt-1.5 text-xs text-ink-faint">
        Leave the original price blank to sell at the selling price with no offer badge. Set it
        higher than the selling price to show a struck-through "was ₹X" offer - same as a quiz or
        practice test's discount display. The original price is never charged, only shown.
      </p>

      <div className="mt-4">
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-faint">Currency</label>
        <select value={currency} onChange={(e) => setCurrency(e.target.value as 'INR' | 'USD')} className="input-dark w-full sm:w-40">
          <option value="INR">INR</option>
          <option value="USD">USD</option>
        </select>
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm text-ink-muted">
        <input type="checkbox" checked={isEnabled} onChange={(e) => setIsEnabled(e.target.checked)} className="h-4 w-4" />
        Available for purchase
      </label>

      <button
        type="button"
        disabled={saveMutation.isPending}
        onClick={() => saveMutation.mutate()}
        className="mt-4 rounded-lg bg-[#155EEF] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {saveMutation.isPending ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}

const FEATURE_LABELS: Record<FeatureKey, string> = {
  ai_course_builder: 'AI Course Builder',
};

// Lets an admin turn any registered feature on/off per category (the four
// built-ins - Admin/Trainer/Content Partner/Sales Partner - plus any
// admin-created custom category, see User Categories on the Users page)
// and grant or exclude specific user IDs regardless of category - see
// api/admin.ts's getFeatureAccessConfig/updateFeatureAccessConfig and
// src/features/admin/lib/featureAccess.ts's decision logic. Starts with
// just the AI Course Builder; a future gated feature only needs a new
// entry in FEATURE_KEYS/FEATURE_LABELS here and in api/admin.ts's/
// api/content-admin.ts's own FEATURE_KEYS.
function FeatureAccessCard() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const { data } = useQuery({ queryKey: ['admin', 'featureAccess'], queryFn: adminApi.getFeatureAccessConfig });
  const { data: categoriesData } = useQuery({ queryKey: ['admin', 'userCategories'], queryFn: adminApi.listUserCategories });
  const [rows, setRows] = useState<Record<FeatureKey, FeatureAccessEntry & { allowText: string; denyText: string }> | null>(null);

  const categoryOptions = [
    ...BUILTIN_CATEGORY_KEYS.map((key) => ({ key, label: BUILTIN_CATEGORY_LABELS[key] })),
    ...(categoriesData?.categories ?? []).map((c) => ({ key: c.key, label: c.label })),
  ];

  useEffect(() => {
    if (!data) return;
    const next = {} as Record<FeatureKey, FeatureAccessEntry & { allowText: string; denyText: string }>;
    for (const key of FEATURE_KEYS) {
      const entry = data.features[key];
      next[key] = { ...entry, allowText: entry.allowUserIds.join(', '), denyText: entry.denyUserIds.join(', ') };
    }
    setRows(next);
  }, [data]);

  const splitIds = (text: string) =>
    text
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!rows) throw new Error('Not loaded yet');
      const features = {} as Record<FeatureKey, FeatureAccessEntry>;
      for (const key of FEATURE_KEYS) {
        const r = rows[key];
        features[key] = { roles: r.roles, allowUserIds: splitIds(r.allowText), denyUserIds: splitIds(r.denyText) };
      }
      return adminApi.updateFeatureAccessConfig(features);
    },
    onSuccess: () => {
      pushToast('Feature access saved', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'featureAccess'] });
    },
    onError: (err) => pushToast(errorText(err, 'Could not save feature access'), 'error'),
  });

  if (!rows) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface-raised p-6">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-ink-faint">Feature Access</h2>
        <p className="text-sm text-ink-faint">Loading…</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface-raised p-6">
      <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-ink-faint">Feature Access</h2>
      <p className="mb-4 text-sm text-ink-faint">
        Control which categories can use each gated feature, and grant or exclude specific accounts
        by their user ID regardless of category. A denied ID always wins; an allowed ID always works
        even if its category is off below. Create custom categories from the Users page.
      </p>

      {FEATURE_KEYS.map((key) => {
        const row = rows[key];
        return (
          <div key={key} className="mb-4 rounded-lg border border-surface-border p-4 last:mb-0">
            <div className="mb-3 font-medium text-ink">{FEATURE_LABELS[key]}</div>

            <div className="mb-3 flex flex-wrap gap-4">
              {categoryOptions.map((cap) => (
                <label key={cap.key} className="flex items-center gap-2 text-sm text-ink-muted">
                  <input
                    type="checkbox"
                    checked={row.roles[cap.key] ?? false}
                    onChange={(e) =>
                      setRows((cur) =>
                        cur ? { ...cur, [key]: { ...cur[key], roles: { ...cur[key].roles, [cap.key]: e.target.checked } } } : cur
                      )
                    }
                    className="h-4 w-4"
                  />
                  <span>{cap.label}</span>
                </label>
              ))}
            </div>

            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-faint">
              Extra grants (user IDs, comma-separated)
            </label>
            <input
              value={row.allowText}
              onChange={(e) => setRows((cur) => (cur ? { ...cur, [key]: { ...cur[key], allowText: e.target.value } } : cur))}
              placeholder="e.g. uid1, uid2"
              className="input-dark w-full"
            />

            <label className="mb-1.5 mt-3 block text-xs font-medium uppercase tracking-wide text-ink-faint">
              Exceptions (user IDs, comma-separated)
            </label>
            <input
              value={row.denyText}
              onChange={(e) => setRows((cur) => (cur ? { ...cur, [key]: { ...cur[key], denyText: e.target.value } } : cur))}
              placeholder="e.g. uid3"
              className="input-dark w-full"
            />
          </div>
        );
      })}

      <button
        type="button"
        disabled={saveMutation.isPending}
        onClick={() => saveMutation.mutate()}
        className="rounded-lg bg-[#155EEF] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {saveMutation.isPending ? 'Saving…' : 'Save Feature Access'}
      </button>
    </div>
  );
}

function CompanyDetailsCard() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const { data } = useQuery({ queryKey: ['admin', 'companyInfo'], queryFn: adminApi.getCompanyInfo });
  const [form, setForm] = useState<CompanyInfoSettings>(EMPTY_COMPANY);

  useEffect(() => {
    if (data) setForm({ ...EMPTY_COMPANY, ...data });
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => adminApi.updateCompanyInfo(form),
    onSuccess: () => {
      queryClient.setQueryData(['admin', 'companyInfo'], form);
      pushToast('Company details saved. Public pages update immediately; prerendered pages update on the next deploy.', 'success');
    },
    onError: (err) => pushToast(errorText(err, 'Could not save company details'), 'error'),
  });

  const dirty = data !== undefined && COMPANY_FIELDS.some((f) => (form[f.key] ?? '') !== (data[f.key] ?? ''));

  return (
    <div className="rounded-xl border border-surface-border bg-surface-raised p-6">
      <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-ink-faint">Company &amp; Contact Details</h2>
      <p className="mb-4 text-sm text-ink-faint">
        Shown on the public Terms, Refund, Support, Privacy and Contact pages and the checkout consent
        links. Leave a field blank to use the built-in default (shown as the placeholder).
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {COMPANY_FIELDS.map((f) => (
          <div key={f.key} className={f.wide ? 'sm:col-span-2' : undefined}>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-faint">{f.label}</label>
            <input
              value={form[f.key]}
              onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
              placeholder={f.placeholder}
              className="input-dark w-full"
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        disabled={!dirty || saveMutation.isPending}
        onClick={() => saveMutation.mutate()}
        className="mt-4 rounded-lg bg-[#155EEF] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {saveMutation.isPending ? 'Saving…' : 'Save Company Details'}
      </button>
    </div>
  );
}
