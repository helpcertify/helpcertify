// Shared "photo or initials" avatar - the real Google profile photo when
// avatarUrl is set (see api/auth.ts's provisionProfile), falling back to a
// solid-color initials circle otherwise (email/password sign-up, or a
// Google account with no profile photo). Used by the header avatar
// (StudentShell.tsx) and the student home page's greeting
// (StudentHomePage.tsx) so both stay visually consistent from one place.
function initials(name?: string): string {
  if (!name?.trim()) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase() || '?';
}

interface AvatarProps {
  name?: string | null;
  avatarUrl?: string | null;
  /** Diameter in pixels. Defaults to 32 (the header's size). */
  size?: number;
  className?: string;
}

export function Avatar({ name, avatarUrl, size = 32, className = '' }: AvatarProps) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-500 font-semibold text-white ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : initials(name ?? undefined)}
    </div>
  );
}
