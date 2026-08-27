import { useState } from 'react';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { authApi } from '@/features/auth/api/authApi';
import { useUiStore } from '@/store/useUiStore';
import { friendlyAuthError } from '@/lib/errorMessages';
import { ProfileActivitySections } from '../components/ProfileActivitySections';

// Was a modal (ProfileModal) triggered from the sidebar's "My Profile"
// button; moved to a real page/route on request, same content, just laid
// out like every other page instead of an overlay. Kept generic (name,
// email, avatar, headline, bio) — this platform is for anyone taking exams
// (students, working professionals, etc.), not scoped to a single
// institution, so it drops the department/year-of-admission/current-
// academic-year fields a campus-specific profile page would have.
export function ProfilePage() {
  const profile = useAuthStore((s) => s.profile);
  const firebaseUser = useAuthStore((s) => s.firebaseUser);
  const setSession = useAuthStore((s) => s.setSession);
  const pushToast = useUiStore((s) => s.pushToast);

  const [headline, setHeadline] = useState(profile?.headline ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  if (!profile || !firebaseUser) return null;

  // Google sign-in accounts have no Helpcertify password on file to reauth
  // against — changePassword would just fail confusingly for them, so this
  // section is swapped for an explanatory note instead.
  const hasPasswordProvider = firebaseUser.providerData.some((p) => p.providerId === 'password');

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const next = { headline: headline.trim() || null, bio: bio.trim() || null };
      await authApi.updateProfile(next);
      setSession(firebaseUser, { ...profile, ...next });
      pushToast('Profile updated', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Could not update profile', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

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
    <div className="max-w-5xl">
      <h1 className="mb-1 text-2xl font-bold text-ink">My Profile</h1>
      <p className="mb-6 text-sm text-ink-faint">Your account details, and how you appear to yourself here.</p>

      {/* Two columns from lg: up (avatar card beside the forms) instead of
          one narrow centered stack — the single-column layout read like a
          mobile view even on a wide desktop screen. Billing & Orders has its
          own sidebar tab again, so this page only holds profile details. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,280px)_1fr]">
        <div className="flex flex-col items-center rounded-xl border border-surface-border bg-surface-raised p-6 lg:self-start">
          {profile.avatarUrl ? (
            <img src={profile.avatarUrl} alt="" className="h-16 w-16 rounded-full" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-gradient text-xl font-bold text-surface">
              {profile.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="mt-3 text-base font-semibold text-ink">{profile.name}</div>
          <div className="text-sm text-ink-faint">{profile.email}</div>
        </div>

        <div className="space-y-6">
          <div className="space-y-3 rounded-xl border border-surface-border bg-surface-raised p-6">
            <h2 className="text-xs font-medium uppercase tracking-wide text-ink-faint">About You</h2>
            <div>
              <label className="mb-1 block text-xs text-ink-faint">Headline</label>
              <input
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                maxLength={100}
                placeholder="e.g. Aspiring CISM, IT Security Analyst"
                className="input-dark"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-ink-faint">Biography</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="A short bio"
                className="input-dark"
              />
            </div>
            <button
              type="button"
              disabled={savingProfile}
              onClick={handleSaveProfile}
              className="rounded-lg bg-[#155EEF] px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {savingProfile ? 'Saving…' : 'Save Profile'}
            </button>
          </div>

          <div className="space-y-3 rounded-xl border border-surface-border bg-surface-raised p-6">
            <h2 className="text-xs font-medium uppercase tracking-wide text-ink-faint">Change Password</h2>
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
                  className="rounded-lg border border-surface-border px-5 py-2 text-sm text-ink-muted hover:border-brand-400 disabled:opacity-60"
                >
                  {changingPassword ? 'Changing…' : 'Change Password'}
                </button>
              </>
            ) : (
              <p className="text-sm text-ink-faint">You signed in with Google, so there's no separate Helpcertify password to change.</p>
            )}
          </div>
        </div>
      </div>

      {/* Your Study Plan, My Exams, Performance Summary, Recommended Next
          Step, and Recent Attempts moved here from the Home dashboard on
          request, so Home stays focused on "what to do right now" and this
          page holds the fuller activity/progress picture. */}
      <ProfileActivitySections />
    </div>
  );
}
