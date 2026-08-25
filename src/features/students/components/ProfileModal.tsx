import { useAuthStore } from '@/features/auth/store/useAuthStore';

interface ProfileModalProps {
  onClose: () => void;
}

// Kept deliberately generic (name, email, avatar) — this platform is for
// anyone taking exams (students, working professionals, etc.), not scoped
// to a single institution, so it drops the department / year-of-admission /
// current-academic-year fields the reference screenshots had.
export function ProfileModal({ onClose }: ProfileModalProps) {
  const profile = useAuthStore((s) => s.profile);

  if (!profile) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl border border-surface-border bg-surface-raised p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Profile Information</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-ink-faint hover:text-ink">
            ✕
          </button>
        </div>

        <div className="mb-5 flex flex-col items-center">
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

        <button type="button" onClick={onClose} className="w-full rounded-lg bg-brand-gradient py-2 font-medium text-surface">
          Close
        </button>
      </div>
    </div>
  );
}
