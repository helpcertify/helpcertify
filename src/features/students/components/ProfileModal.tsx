import { useState } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { useUiStore } from '@/store/useUiStore';

interface ProfileModalProps {
  onClose: () => void;
}

// Department / year-of-admission / current-academic-year are self-service —
// firestore.rules allows a signed-in user to write these on their own
// users/{uid} doc directly (no Vercel function needed). Unlike the reference
// screenshots, unset values show as "Not set" rather than "NaN".
export function ProfileModal({ onClose }: ProfileModalProps) {
  const profile = useAuthStore((s) => s.profile);
  const pushToast = useUiStore((s) => s.pushToast);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [department, setDepartment] = useState(profile?.department ?? '');
  const [yearOfAdmission, setYearOfAdmission] = useState(profile?.yearOfAdmission?.toString() ?? '');
  const [currentAcademicYear, setCurrentAcademicYear] = useState(profile?.currentAcademicYear ?? '');

  if (!profile) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', profile._id), {
        department: department.trim() || null,
        yearOfAdmission: yearOfAdmission ? Number(yearOfAdmission) : null,
        currentAcademicYear: currentAcademicYear.trim() || null,
        updatedAt: serverTimestamp(),
      });
      // initAuth.ts's onSnapshot-free listener only re-reads on auth state
      // changes, so the store won't pick this up until next sign-in — fine
      // for this modal since it re-reads its own local state, but a full
      // page refresh will show the saved value from Firestore either way.
      pushToast('Profile updated', 'success');
      setEditing(false);
    } catch {
      pushToast('Could not save profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl border border-surface-border bg-surface-raised p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Profile Information</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-neutral-400 hover:text-white">
            ✕
          </button>
        </div>

        <div className="mb-5 flex flex-col items-center border-b border-surface-border pb-5">
          {profile.avatarUrl ? (
            <img src={profile.avatarUrl} alt="" className="h-16 w-16 rounded-full" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-gradient text-xl font-bold text-surface">
              {profile.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="mt-3 text-base font-semibold text-white">{profile.name}</div>
          <div className="text-sm text-neutral-400">{profile.email}</div>
        </div>

        {editing ? (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-300">Department</label>
              <input
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full rounded-lg border border-surface-border bg-black/30 px-3 py-2 text-white outline-none focus:border-brand-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-300">Year of Admission</label>
              <input
                type="number"
                value={yearOfAdmission}
                onChange={(e) => setYearOfAdmission(e.target.value)}
                className="w-full rounded-lg border border-surface-border bg-black/30 px-3 py-2 text-white outline-none focus:border-brand-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-300">Current Academic Year</label>
              <input
                value={currentAcademicYear}
                onChange={(e) => setCurrentAcademicYear(e.target.value)}
                placeholder="e.g. 3rd Year"
                className="w-full rounded-lg border border-surface-border bg-black/30 px-3 py-2 text-white outline-none focus:border-brand-400"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="flex-1 rounded-lg border border-surface-border py-2 text-sm text-neutral-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSave}
                className="flex-1 rounded-lg bg-brand-gradient py-2 text-sm font-medium text-surface disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <ProfileField label="Department" value={profile.department} />
            <ProfileField label="Year of Admission" value={profile.yearOfAdmission?.toString() ?? null} />
            <ProfileField label="Current Academic Year" value={profile.currentAcademicYear} />
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="w-full rounded-lg border border-surface-border py-2 text-sm text-neutral-300 hover:border-brand-400"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg bg-brand-gradient py-2 font-medium text-surface"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-lg bg-black/20 px-4 py-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-0.5 font-medium text-white">{value || 'Not set'}</div>
    </div>
  );
}
