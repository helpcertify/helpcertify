import { useQuery } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/features/auth/store/useAuthStore';

export interface ReferralProgramSettings {
  creditAmountMinor: number;
  refereeRewardType: 'flat' | 'percent';
  refereeRewardValue: number;
}

// Direct Firestore read of appSettings/referralProgram (signed-in
// readable - see firestore.rules), same pattern as
// loadAppearance.ts's read of appSettings/appearance. This is the single
// source of truth for what the sidebar's "Refer & Earn" card advertises -
// it used to hardcode "₹500" independent of the actual configured reward
// (appSettings/general.referralCreditAmountMinor, admin-only). A long
// staleTime is fine: an admin changing this setting is rare, and every
// mount still gets a fresh network read on cold cache.
//
// Returns undefined while loading/signed-out, and undefined (not a
// fallback number) if the doc doesn't exist yet - a pre-existing
// deployment only gets this doc once an admin re-saves Settings (see
// api/admin.ts's updateAppSettings), so callers should degrade to
// generic copy rather than guessing a figure.
export function useReferralProgramSettings() {
  const firebaseUser = useAuthStore((s) => s.firebaseUser);

  return useQuery({
    queryKey: ['student', 'referralProgramSettings'],
    queryFn: async (): Promise<ReferralProgramSettings | null> => {
      const snap = await getDoc(doc(db, 'appSettings', 'referralProgram'));
      const data = snap.data();
      if (!data || typeof data.creditAmountMinor !== 'number') return null;
      return {
        creditAmountMinor: data.creditAmountMinor,
        refereeRewardType: data.refereeRewardType === 'flat' ? 'flat' : 'percent',
        refereeRewardValue: typeof data.refereeRewardValue === 'number' ? data.refereeRewardValue : 10,
      };
    },
    enabled: !!firebaseUser,
    staleTime: 10 * 60_000,
  });
}
