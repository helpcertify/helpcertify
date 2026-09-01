import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { toDate } from '@/utils/formatDate';
import { computeCreditStatus } from '../lib/referralRules';
import type { CreditLedgerEntryDoc } from '@/types/models';

export interface MyCreditEntry {
  id: string;
  referralId: string;
  amountMinor: number;
  remainingMinor: number;
  status: 'pending_validation' | 'active' | 'depleted' | 'expired' | 'reversed';
  validationEndsAt: Date;
  expiresAt: Date;
}

export interface MyCredits {
  // Sum of every 'active' entry's remainingMinor - what's actually
  // spendable right now (see CartPage's/BuyNowModal's "use credit"
  // toggle). Excludes pending_validation (not yet spendable),
  // depleted/expired/reversed (nothing left, or no longer valid).
  spendableMinor: number;
  entries: MyCreditEntry[];
}

// This account's own Refer & Earn credit ledger (the referrer side) -
// direct Firestore read, same pattern as useMyAvailableCoupons/
// useMyWelcomeCoupon. Status here is *recomputed live* from each entry's
// timestamps (see referralRules.ts's computeCreditStatus) rather than
// trusted from the stored field, since nothing in this app proactively
// flips pending_validation -> active/expired on a schedule - only
// whoever spends an entry (or an admin reversing one) writes a status
// change. depleted/reversed still come from the stored value, since
// those two are always written explicitly the moment they happen.
export function useMyCredits() {
  const firebaseUser = useAuthStore((s) => s.firebaseUser);

  return useQuery({
    queryKey: ['student', 'myCredits', firebaseUser?.uid],
    queryFn: async (): Promise<MyCredits> => {
      const snap = await getDocs(query(collection(db, 'creditLedgerEntries'), where('referrerUid', '==', firebaseUser!.uid)));
      const now = new Date();
      const entries: MyCreditEntry[] = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as CreditLedgerEntryDoc) }))
        .map((e) => {
          const validationEndsAt = toDate(e.validationEndsAt);
          const expiresAt = toDate(e.expiresAt);
          const liveStatus =
            e.status === 'depleted' || e.status === 'reversed' ? e.status : computeCreditStatus({ validationEndsAt, expiresAt }, now);
          return {
            id: e.id,
            referralId: e.referralId,
            amountMinor: e.amountMinor,
            remainingMinor: e.remainingMinor,
            status: liveStatus,
            validationEndsAt,
            expiresAt,
          };
        });

      const spendableMinor = entries.filter((e) => e.status === 'active').reduce((sum, e) => sum + e.remainingMinor, 0);
      return { spendableMinor, entries };
    },
    enabled: !!firebaseUser?.uid,
  });
}
