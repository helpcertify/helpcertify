import { create } from 'zustand';
import type { User as FirebaseUser } from 'firebase/auth';
import type { SafeUser } from '@/types/api';

interface AuthState {
  firebaseUser: FirebaseUser | null;
  profile: SafeUser | null;
  // True until the first onAuthStateChanged callback fires — Firebase's own
  // session check is async, so ProtectedRoute must wait on this instead of
  // treating profile === null as "definitely signed out" on first render.
  isInitializing: boolean;
  setSession: (firebaseUser: FirebaseUser, profile: SafeUser) => void;
  clearSession: () => void;
}

// No zustand `persist` here — Firebase Auth already persists the session
// itself (IndexedDB) and replays it through onAuthStateChanged on load, so
// mirroring it into localStorage too would just be a second, staler copy.
export const useAuthStore = create<AuthState>((set) => ({
  firebaseUser: null,
  profile: null,
  isInitializing: true,
  setSession: (firebaseUser, profile) => set({ firebaseUser, profile, isInitializing: false }),
  clearSession: () => set({ firebaseUser: null, profile: null, isInitializing: false }),
}));
