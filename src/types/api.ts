export type Role = 'student' | 'admin';

export interface SafeUser {
  _id: string;
  name: string;
  email: string;
  role: Role;
  avatarUrl: string | null;
  headline: string | null;
  bio: string | null;
  // False only when email OTP verification was on at registration and the
  // code hasn't been entered yet - missing/true for every account created
  // before this feature, or with the setting off, or via Google (already
  // OAuth-verified). See ProtectedRoute for the one place this gates
  // anything.
  emailVerified: boolean;
  // Refer & Earn - null until api/auth.ts's ensureReferralCode backfills it
  // (called lazily on first My Profile visit for an account that predates
  // this feature).
  referralCode: string | null;
}
