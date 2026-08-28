export interface LoginPayload {
  email: string;
  password: string;
}

// No `role` field — every self-registered account is a student (api/auth.ts
// fixes this server-side). Admin accounts are created by an existing admin.
export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  // Refer & Earn — a code captured from a "?ref=" query param on the
  // register page (RegisterPage.tsx), not a form field the learner types.
  // A bad/expired code never blocks signup; api/auth.ts just skips linking
  // the referral silently.
  referralCode?: string;
}
