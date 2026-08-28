import { useState } from 'react';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { authApi } from '@/features/auth/api/authApi';
import { useUiStore } from '@/store/useUiStore';
import { ProfileActivitySections } from '../components/ProfileActivitySections';
import { ReferAndEarnSection } from '../components/ReferAndEarnSection';

// Was a modal (ProfileModal) triggered from the sidebar's "My Profile"
// button; moved to a real page/route on request, same content, just laid
// out like every other page instead of an overlay. Kept generic (name,
// email, avatar, headline, bio) — this platform is for anyone taking exams
// (students, working professionals, etc.), not scoped to a single
// institution, so it drops the department/year-of-admission/current-
// academic-year fields a campus-specific profile page would have.
//
// Change Password moved to Settings → Security on request (same
// authApi.changePassword call, just relocated — see SettingsPage.tsx).
// This page is scoped to identity + learning goal + exams owned; the
// fuller attempt history/scoring is on My Attempts, not duplicated here.
export function ProfilePage() {
  const profile = useAuthStore((s) => s.profile);
  const firebaseUser = useAuthStore((s) => s.firebaseUser);
  const setSession = useAuthStore((s) => s.setSession);
  const pushToast = useUiStore((s) => s.pushToast);

  const [editing, setEditing] = useState(false);
  const [headline, setHeadline] = useState(profile?.headline ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [savingProfile, setSavingProfile] = useState(false);

  if (!profile || !firebaseUser) return null;

  const startEditing = () => {
    setHeadline(profile.headline ?? '');
    setBio(profile.bio ?? '');
    setEditing(true);
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const next = { headline: headline.trim() || null, bio: bio.trim() || null };
      await authApi.updateProfile(next);
      setSession(firebaseUser, { ...profile, ...next });
      pushToast('Profile updated', 'success');
      setEditing(false);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Could not update profile', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div className="mx-auto w-[calc(100%-48px)] max-w-[1440px]">
      <h1 className="mb-1 text-[28px] font-bold text-[#0F172A]">My Profile</h1>
      <p className="mb-6 text-sm text-[#64748B]">Manage your profile and learning journey.</p>

      {/* Profile hero — identity at a glance, editable inline rather than a
          permanent block of form fields. */}
      <div className="mb-6 rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-[0_2px_8px_rgba(15,23,42,0.05)] dark:bg-surface-raised">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt="" className="h-20 w-20 rounded-full object-cover" />
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-[#155EEF] text-2xl font-bold text-white">
                {profile.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <div className="text-[22px] font-bold leading-tight text-[#0F172A]">{profile.name}</div>
              <div className="text-sm text-[#64748B]">{profile.email}</div>
            </div>
          </div>
          {!editing && (
            <button
              type="button"
              onClick={startEditing}
              className="rounded-lg border border-[#155EEF] px-4 py-2 text-sm font-semibold text-[#155EEF] hover:bg-[#EFF6FF]"
            >
              Edit Profile
            </button>
          )}
        </div>

        {editing ? (
          <div className="mt-5 space-y-4 border-t border-[#E2E8F0] pt-5">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#64748B]">Headline</label>
              <input
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                maxLength={100}
                placeholder="Security professional preparing for CISA"
                className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#1E293B] outline-none focus:border-[#155EEF] dark:bg-transparent"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#64748B]">Biography</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="Tell us a little about yourself and your certification goals."
                className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#1E293B] outline-none focus:border-[#155EEF] dark:bg-transparent"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={savingProfile}
                onClick={handleSaveProfile}
                className="rounded-lg bg-[#155EEF] px-5 py-2 text-sm font-semibold text-white hover:bg-[#004EEB] disabled:opacity-60"
              >
                {savingProfile ? 'Saving…' : 'Save Changes'}
              </button>
              <button
                type="button"
                disabled={savingProfile}
                onClick={() => setEditing(false)}
                className="rounded-lg border border-[#E2E8F0] px-5 py-2 text-sm font-semibold text-[#334155] hover:bg-[#F8FAFC] disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          (profile.headline || profile.bio) && (
            <div className="mt-4 border-t border-[#E2E8F0] pt-4">
              {profile.headline && <div className="text-sm font-semibold text-[#0F172A]">{profile.headline}</div>}
              {profile.bio && <p className="mt-1 whitespace-pre-line text-sm text-[#1E293B]">{profile.bio}</p>}
            </div>
          )
        )}
      </div>

      <ReferAndEarnSection />

      {/* Your Learning Journey + My Exams — moved here from the Home
          dashboard on request, so Home stays focused on "what to do right
          now" and this page holds identity + the learner's goal + what
          they own. */}
      <ProfileActivitySections />
    </div>
  );
}
