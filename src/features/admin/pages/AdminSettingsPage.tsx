import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi, type AppSettings, type RewardType } from '../api/adminApi';
import { useUiStore } from '@/store/useUiStore';
import { majorToMinor, minorToMajor } from '@/utils/currency';

// The admin portal's one settings screen — OTP toggles, plus (below) the
// Refer & Earn reward amounts. One combined Save Changes button, matching
// api/admin.ts's updateAppSettingsSchema, which takes every field together
// rather than supporting a partial update.
export function AdminSettingsPage() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const { data } = useQuery({ queryKey: ['admin', 'appSettings'], queryFn: adminApi.getAppSettings });
  const [emailOtpEnabled, setEmailOtpEnabled] = useState(false);

  // Refer & Earn — value is always typed in the unit the current type
  // implies (rupees for flat, a plain percent number for percent), matching
  // how every other price field in the admin already works (see
  // PracticeTestFormCard's own price input) — converted to/from paise only
  // at the load/save boundary, never stored as a raw major-unit number.
  const [referrerType, setReferrerType] = useState<RewardType>('flat');
  const [referrerValue, setReferrerValue] = useState('');
  const [refereeType, setRefereeType] = useState<RewardType>('flat');
  const [refereeValue, setRefereeValue] = useState('');

  useEffect(() => {
    if (!data) return;
    setEmailOtpEnabled(data.emailOtpEnabled);
    setReferrerType(data.referrerRewardType);
    setReferrerValue(
      data.referrerRewardType === 'flat' ? String(minorToMajor(data.referrerRewardValue)) : String(data.referrerRewardValue)
    );
    setRefereeType(data.refereeRewardType);
    setRefereeValue(
      data.refereeRewardType === 'flat' ? String(minorToMajor(data.refereeRewardValue)) : String(data.refereeRewardValue)
    );
  }, [data]);

  const buildPayload = (): AppSettings => ({
    emailOtpEnabled,
    mobileOtpEnabled: false,
    referrerRewardType: referrerType,
    referrerRewardValue: referrerType === 'flat' ? majorToMinor(Number(referrerValue) || 0) : Math.round(Number(referrerValue) || 0),
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
      payload.referrerRewardType !== data.referrerRewardType ||
      payload.referrerRewardValue !== data.referrerRewardValue ||
      payload.refereeRewardType !== data.refereeRewardType ||
      payload.refereeRewardValue !== data.refereeRewardValue);

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
          <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-ink-faint">🎁 Refer &amp; Earn Rewards</h2>
          <p className="mb-4 text-sm text-ink-faint">
            Only applies to referrals created after you save. An already-granted coupon keeps the amount it was
            promised at the time.
          </p>

          <div className="mb-4">
            <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-faint">
              Referrer reward (granted once their referral makes a first purchase)
            </div>
            <div className="flex gap-2">
              <select
                value={referrerType}
                onChange={(e) => setReferrerType(e.target.value as RewardType)}
                className="input-dark w-32"
              >
                <option value="flat">Flat ₹</option>
                <option value="percent">Percent %</option>
              </select>
              <input
                type="number"
                min={1}
                max={referrerType === 'percent' ? 95 : undefined}
                value={referrerValue}
                onChange={(e) => setReferrerValue(e.target.value)}
                placeholder={referrerType === 'flat' ? 'e.g. 500' : 'e.g. 10'}
                className="input-dark flex-1"
              />
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-faint">
              Referee reward (granted immediately at signup)
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
                placeholder={refereeType === 'flat' ? 'e.g. 200' : 'e.g. 5'}
                className="input-dark flex-1"
              />
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
