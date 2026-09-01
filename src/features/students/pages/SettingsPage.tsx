import { useState } from 'react';
import { useThemeStore } from '@/store/useThemeStore';
import { SunIcon, MoonIcon } from '@/components/common/icons';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { authApi } from '@/features/auth/api/authApi';
import { useUiStore } from '@/store/useUiStore';
import { friendlyAuthError } from '@/lib/errorMessages';

// A home for account-wide preferences. Appearance (theme) used to live as a
// standalone icon toggle in the header; it moved here so the header stays
// uncluttered and future settings have a natural place to land - each new
// preference gets its own <section> card below Appearance, not a new header
// icon. Security (Change Password) moved here from My Profile on request -
// same authApi.changePassword call as before, just relocated so password
// management isn't duplicated across two pages.
export function SettingsPage() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const darkModeAllowed = useThemeStore((s) => s.darkModeAllowed);
  const firebaseUser = useAuthStore((s) => s.firebaseUser);
  const pushToast = useUiStore((s) => s.pushToast);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Google sign-in accounts have no Helpcertify password on file to reauth
  // against - changePassword would just fail confusingly for them, so this
  // section is swapped for an explanatory note instead.
  const hasPasswordProvider = firebaseUser?.providerData.some((p) => p.providerId === 'password') ?? false;

  const handleChangePassword = async () => {
    if (newPassword.length < 8) {
      pushToast('New password must be at least 8 characters', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      pushToast('New passwords do not match', 'error');
      return;
    }
    setChangingPassword(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      pushToast('Password changed', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      pushToast(friendlyAuthError(err, 'Could not change password'), 'error');
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-ink">Settings</h1>
      <p className="mb-6 text-sm text-ink-faint">Manage how Helpcertify looks and behaves for you.</p>

      {darkModeAllowed && (
      <section className="mb-6 rounded-xl border border-surface-border bg-surface-raised p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink-faint">Appearance</h2>
        <p className="mb-4 mt-1 text-sm text-ink-faint">Choose how the app looks on this device.</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTheme('light')}
            className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium ${
              theme === 'light'
                ? 'border-brand-400 bg-brand-500/15 text-brand-ink'
                : 'border-surface-border text-ink-muted hover:border-brand-400'
            }`}
          >
            <SunIcon className="h-4 w-4" />
            Light
          </button>
          <button
            type="button"
            onClick={() => setTheme('dark')}
            className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium ${
              theme === 'dark'
                ? 'border-brand-400 bg-brand-500/15 text-brand-ink'
                : 'border-surface-border text-ink-muted hover:border-brand-400'
            }`}
          >
            <MoonIcon className="h-4 w-4" />
            Dark
          </button>
        </div>
      </section>
      )}

      <section className="rounded-xl border border-surface-border bg-surface-raised p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink-faint">Security</h2>
        <p className="mb-4 mt-1 text-sm text-ink-faint">Change your account password.</p>
        {hasPasswordProvider ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Current password"
                className="input-dark"
              />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password (min. 8 characters)"
                className="input-dark"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="input-dark"
              />
            </div>
            <button
              type="button"
              disabled={changingPassword || !currentPassword || !newPassword}
              onClick={handleChangePassword}
              className="mt-4 rounded-lg bg-[#155EEF] px-5 py-2 text-sm font-semibold text-white hover:bg-[#004EEB] disabled:opacity-60"
            >
              {changingPassword ? 'Changing…' : 'Change Password'}
            </button>
          </>
        ) : (
          <p className="text-sm text-ink-faint">You signed in with Google, so there's no separate Helpcertify password to change.</p>
        )}
      </section>
    </div>
  );
}
