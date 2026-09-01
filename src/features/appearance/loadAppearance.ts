import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useThemeStore } from '@/store/useThemeStore';

// SPA-only: reads the admin-controlled dark-mode feature flag from
// Firestore `appSettings/appearance` (publicly readable - see
// firestore.rules) and tells the theme store whether a saved dark
// preference may take effect. Imported ONLY by AppProviders, so Firebase
// stays out of the SSR/prerender module graph. Runs once per page load;
// any failure leaves the app in its default light mode.
let started = false;

export async function loadAppearanceSettings(): Promise<void> {
  if (started) return;
  started = true;
  try {
    const snap = await getDoc(doc(db, 'appSettings', 'appearance'));
    useThemeStore.getState().setDarkModeAllowed(snap.data()?.darkModeEnabled === true);
  } catch {
    useThemeStore.getState().setDarkModeAllowed(false);
  }
}
