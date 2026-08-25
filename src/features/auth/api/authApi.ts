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

export const authApi = {
  // Role is always 'student' here — set server-side by api/auth.ts, never
  // client-supplied. Admin accounts are created by an existing admin via
  // api/admin.ts's createAdminAccount, never self-registered.
  async register(payload: RegisterPayload) {
    await callAction('auth', 'register', { ...payload });
    await signInWithEmailAndPassword(auth, payload.email, payload.password);
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
  async signInWithGoogle() {
    await signInWithPopup(auth, googleProvider);
    await callAction('auth', 'provisionProfile');
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

  updateProfile: (payload: { headline?: string | null; bio?: string | null; website?: string | null }) =>
    callAction<{ success: true }>('auth', 'updateProfile', { ...payload }),
};
