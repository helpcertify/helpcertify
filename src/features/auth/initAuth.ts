import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuthStore } from './store/useAuthStore';
import type { SafeUser } from '@/types/api';

async function loadProfile(firebaseUser: FirebaseUser): Promise<SafeUser> {
  const profileSnap = await getDoc(doc(db, 'users', firebaseUser.uid));
  const profileData = profileSnap.data();

  return {
    _id: firebaseUser.uid,
    name: profileData?.name ?? firebaseUser.displayName ?? '',
    email: firebaseUser.email ?? '',
    role: (profileData?.role as SafeUser['role']) ?? 'student',
    avatarUrl: profileData?.avatarUrl ?? firebaseUser.photoURL ?? null,
    headline: profileData?.headline ?? null,
    bio: profileData?.bio ?? null,
    // Missing = registered before this field existed (or OTP was off) —
    // treated as verified rather than retroactively locking anyone out.
    emailVerified: profileData?.emailVerified !== false,
  };
}

/**
 * Called once at app startup (see app/providers.tsx). Keeps the auth store
 * in sync with Firebase Auth's own session — sign-in, sign-out, and a token
 * refresh on another tab all flow through this one listener automatically.
 * Role comes from the Firestore users/{uid} doc, not an ID-token custom
 * claim — this is what lets an admin account be created (or promoted)
 * entirely from the Firebase Console, no Admin SDK script required (see
 * api/admin.ts's requireAdmin for the same reasoning server-side).
 */
export function initAuthListener(): () => void {
  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (!firebaseUser) {
      useAuthStore.getState().clearSession();
      return;
    }
    useAuthStore.getState().setSession(firebaseUser, await loadProfile(firebaseUser));
  });
}

// Re-reads the Firestore profile for the currently signed-in user and pushes
// it into the store — used right after VerifyEmailPage confirms an OTP, so
// the newly-true emailVerified flag takes effect without waiting for
// onAuthStateChanged to fire again (it doesn't fire on a Firestore write).
export async function refreshProfile(): Promise<void> {
  const firebaseUser = useAuthStore.getState().firebaseUser;
  if (!firebaseUser) return;
  useAuthStore.getState().setSession(firebaseUser, await loadProfile(firebaseUser));
}
