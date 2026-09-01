import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useCompanyInfoStore } from './companyInfoStore';

// SPA-only: reads the admin-editable company / contact overrides from
// Firestore `appSettings/company` (publicly readable - see firestore.rules)
// and merges them into the store. Imported ONLY by AppProviders, never by a
// marketing page or the prerender entry, so Firebase stays out of the SSR
// module graph. Runs once per page load; failures are swallowed so the
// compile-time defaults simply stand.
let started = false;

export async function loadCompanyInfoOverrides(): Promise<void> {
  if (started) return;
  started = true;
  try {
    const snap = await getDoc(doc(db, 'appSettings', 'company'));
    if (snap.exists()) {
      useCompanyInfoStore.getState().applyOverrides(snap.data() as Record<string, unknown>);
    }
  } catch {
    // offline, rules, or missing config - keep the defaults.
  }
}
