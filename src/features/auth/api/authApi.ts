import {
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  sendPasswordResetEmail,
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
    await sendPasswordResetEmail(auth, email);
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
};
