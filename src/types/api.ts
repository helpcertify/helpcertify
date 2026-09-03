// 'finance_admin' is the one partner-framework staff sub-role added in
// Phase 1 (payout maker/checker in Phase 4 needs approver != creator).
// 'admin' stays super-admin. partner_manager / product_admin / auditor
// arrive in Phase 3 with their screens. A partner is NOT a role - it's a
// partners/{id} entity linked from users/{uid}.partnerId (see SafeUser).
export type Role = 'student' | 'admin' | 'finance_admin';

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
  // Partner Commission Framework - set on users/{uid} by
  // api/admin.ts's reviewPartnerApplication when an application is approved.
  // Present => this account is an approved partner; the partner portal
  // (Phase 3) route-gates on it. null for everyone else.
  partnerId: string | null;
  // Field-level permission (PRD 15): true only for the specific staff users
  // allowed to reveal a partner's full PAN, gated separately from the role.
  // Set by hand on users/{uid}.canRevealPan. false/absent for everyone else.
  canRevealPan: boolean;
}
