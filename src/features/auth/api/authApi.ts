import {
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  sendPasswordResetEmail,
  verifyPasswordResetCode,
  confirmPasswordReset,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { callAction } from '@/lib/vercelApi';
import type { LoginPayload, RegisterPayload } from '../types';

const googleProvider = new GoogleAuthProvider();

// Refer & Earn — present only when this signup used a valid referral code;
// the coupon is already redeemable (see api/auth.ts's linkReferral), not a
// promise of something granted later. type/value match CouponDoc's own
// discountType/discountValue convention (flat is paise, percent is 1-95) —
// admin-configurable, see api/admin.ts's getAppSettings/updateAppSettings.
export interface WelcomeCoupon {
  code: string;
  type: 'flat' | 'percent';
  value: number;
}

export const authApi = {
  // Role is always 'student' here — set server-side by api/auth.ts, never
  // client-supplied. Admin accounts are created by an existing admin via
  // api/admin.ts's createAdminAccount, never self-registered.
  async register(payload: RegisterPayload) {
    const result = await callAction<{ uid: string; otpRequired: boolean; welcomeCoupon: WelcomeCoupon | null }>(
      'auth',
      'register',
      { ...payload }
    );
    await signInWithEmailAndPassword(auth, payload.email, payload.password);
    return result;
  },

  async login({ email, password }: LoginPayload) {
    await signInWithEmailAndPassword(auth, email, password);
  },

  // signInWithPopup creates the Firebase Auth account itself for a
  // first-time signer — no register call involved. The Firestore profile +
  // default 'student' role claim get provisioned by a follow-up call to
  // api/auth.ts's provisionProfile action, which is idempotent (only writes
  // on an account's actual first sign-in), so there's no "register vs.
  // login" distinction to make for Google.
  async signInWithGoogle(referralCode?: string) {
    await signInWithPopup(auth, googleProvider);
    return callAction<{ provisioned: boolean; welcomeCoupon: WelcomeCoupon | null }>('auth', 'provisionProfile', {
      referralCode,
    });
  },

  async logout() {
    await signOut(auth);
  },

  async forgotPassword(email: string) {
    // `url` is where the recipient lands: our own /reset-password page when
    // the Firebase project's action URL points there (fully branded flow),
    // or the "Continue" target after Firebase's own hosted reset page
    // otherwise. Either way /reset-password handles both an oobCode present
    // (do the reset) and absent (send them to log in). helpcertify.com is
    // already an authorised Auth domain, so this URL is accepted.
    await sendPasswordResetEmail(auth, email, {
      url: `${window.location.origin}/reset-password`,
      handleCodeInApp: false,
    });
  },

  // Branded /reset-password page: check the oobCode from the email link is
  // valid (returns the account email), then set the new password.
  async verifyPasswordResetCode(oobCode: string) {
    return verifyPasswordResetCode(auth, oobCode);
  },
  async confirmPasswordReset(oobCode: string, newPassword: string) {
    await confirmPasswordReset(auth, oobCode, newPassword);
  },

  // Handled entirely client-side by the Auth SDK — no backend endpoint needed.
  async changePassword(currentPassword: string, newPassword: string) {
    const user = auth.currentUser;
    if (!user?.email) throw new Error('Not signed in');
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPassword);
  },

  updateProfile: (payload: { headline?: string | null; bio?: string | null }) =>
    callAction<{ success: true }>('auth', 'updateProfile', { ...payload }),

  verifyEmailOtp: (code: string) => callAction<{ success: true }>('auth', 'verifyEmailOtp', { code }),
  resendEmailOtp: () => callAction<{ success: true }>('auth', 'resendEmailOtp'),

  // Refer & Earn — lazily backfills a referral code for an account that
  // predates this feature (a no-op, returning the existing code, once one's
  // already set). Called once from My Profile.
  ensureReferralCode: () => callAction<{ referralCode: string }>('auth', 'ensureReferralCode'),

  // Refer & Earn — for an account that registered without a code (item 4/5
  // of the spec: the code can still be applied any time before this
  // account's first purchase, not only at registration). Rejected with a
  // clear reason if this account has already purchased something, already
  // has a referral linked, or the code is invalid/self/fraud-flagged.
  applyReferralCode: (referralCode: string) =>
    callAction<{ success: true; welcomeCoupon: WelcomeCoupon | null } | { success: false; reason: string }>(
      'auth',
      'applyReferralCode',
      { referralCode }
    ),
};
