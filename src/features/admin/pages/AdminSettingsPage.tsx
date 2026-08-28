import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi, type AppSettings, type RewardType } from '../api/adminApi';
import { contentAdminApi } from '../api/contentAdminApi';
import { useUiStore } from '@/store/useUiStore';
import { majorToMinor, minorToMajor } from '@/utils/currency';

// The admin portal's one settings screen — OTP toggles, plus (below) the
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

  // Refer & Earn — every amount is typed in rupees (converted to/from
  // paise only at the load/save boundary, never stored as a raw
  // major-unit number), matching how every other price field in the admin
  // already works (see PracticeTestFormCard's own price input). The
  // referrer's reward is always a flat credit amount (no percent option —
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
    onError: (err) => pushToast(err instanceof Error ? err.message : 'Could not save settings', 'error'),
  });

  const payload = buildPayload();
  const dirty =
    data !== undefined &&
    (payload.emailOtpEnabled !== data.emailOtpEnabled ||
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
      <p className="mb-6 text-sm text-ink-faint">Registration, account-verification, and Refer &amp; Earn options.</p>

      <div className="max-w-xl space-y-6">
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
