import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi, type AppSettings } from '../api/adminApi';
import { useUiStore } from '@/store/useUiStore';

// The one settings screen in the admin portal so far — just the OTP
// toggles. Mobile OTP's checkbox is shown (so the option is visible/
// discoverable) but disabled, since there's no SMS provider wired up
// server-side yet (see api/admin.ts's getAppSettings).
export function AdminSettingsPage() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const { data } = useQuery({ queryKey: ['admin', 'appSettings'], queryFn: adminApi.getAppSettings });
  const [emailOtpEnabled, setEmailOtpEnabled] = useState(false);

  useEffect(() => {
    if (data) setEmailOtpEnabled(data.emailOtpEnabled);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (next: AppSettings) => adminApi.updateAppSettings(next),
    onSuccess: (_, next) => {
      queryClient.setQueryData(['admin', 'appSettings'], next);
      pushToast('Settings saved', 'success');
    },
    onError: () => pushToast('Could not save settings', 'error'),
  });

  const dirty = data !== undefined && emailOtpEnabled !== data.emailOtpEnabled;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-ink">Settings</h1>
      <p className="mb-6 text-sm text-ink-faint">Registration and account-verification options.</p>

      <div className="max-w-xl rounded-xl border border-surface-border bg-surface-raised p-6">
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

        <button
          type="button"
          disabled={!dirty || saveMutation.isPending}
          onClick={() => saveMutation.mutate({ emailOtpEnabled, mobileOtpEnabled: false })}
          className="mt-5 rounded-lg bg-[#155EEF] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saveMutation.isPending ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
