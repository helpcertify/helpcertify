import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuthStore } from './store/useAuthStore';
import type { SafeUser } from '@/types/api';

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

    const profileSnap = await getDoc(doc(db, 'users', firebaseUser.uid));
    const profileData = profileSnap.data();

    const profile: SafeUser = {
      _id: firebaseUser.uid,
      name: profileData?.name ?? firebaseUser.displayName ?? '',
      email: firebaseUser.email ?? '',
      role: (profileData?.role as SafeUser['role']) ?? 'student',
      avatarUrl: profileData?.avatarUrl ?? firebaseUser.photoURL ?? null,
      department: profileData?.department ?? null,
      yearOfAdmission: profileData?.yearOfAdmission ?? null,
      currentAcademicYear: profileData?.currentAcademicYear ?? null,
    };

    useAuthStore.getState().setSession(firebaseUser, profile);
  });
}
