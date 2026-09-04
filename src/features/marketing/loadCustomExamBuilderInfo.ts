import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useCustomExamBuilderStore } from './customExamBuilderStore';

// SPA-only: reads the admin-editable Custom Exam Builder price/offer from
// Firestore appSettings/customExamBuilder (publicly readable - see
// firestore.rules) and merges it into the store. Imported ONLY by
// AppProviders, never by a marketing page or the prerender entry, so
// Firebase stays out of the SSR module graph - same pattern as
// loadCompanyInfo.ts. Runs once per page load; failures are swallowed so
// the compile-time defaults simply stand.
let started = false;

export async function loadCustomExamBuilderOverrides(): Promise<void> {
  if (started) return;
  started = true;
  try {
    const snap = await getDoc(doc(db, 'appSettings', 'customExamBuilder'));
    const data = snap.data();
    if (!data) return;
    useCustomExamBuilderStore.getState().applyOverrides({
      ...(typeof data.priceMinor === 'number' ? { priceMinor: data.priceMinor } : {}),
      originalPriceMinor: typeof data.originalPriceMinor === 'number' ? data.originalPriceMinor : null,
      currency: data.currency === 'USD' ? 'USD' : 'INR',
      isEnabled: data.isEnabled !== false,
    });
  } catch {
    // offline, rules, or missing config - keep the defaults.
  }
}
