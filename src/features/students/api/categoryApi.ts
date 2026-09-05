import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { callAction } from '@/lib/vercelApi';
import type { UserCategory } from '@/features/admin/api/adminApi';

// Self-service half of User Categories - requesting Trainer status or a
// custom category, and checking your own pending/approved status. The
// admin-side CRUD/review actions live in adminApi.ts; these are the
// student-reachable actions api/auth.ts hosts (requestTrainerStatus/
// requestUserCategory/getMyCategoryStatus).

export interface MyTrainerApplication {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewNote: string | null;
}

export interface MyCategoryMembership {
  id: string;
  categoryKey: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewNote: string | null;
}

export const categoryApi = {
  // Signed-in read of the category registry (firestore.rules allows it) -
  // no round trip to a Vercel function needed just to list options.
  listAvailableCategories: async (): Promise<UserCategory[]> => {
    const snap = await getDocs(collection(db, 'userCategories'));
    return snap.docs.map((d) => ({ key: d.id, ...(d.data() as Omit<UserCategory, 'key'>) }));
  },

  requestTrainerStatus: (message?: string) =>
    callAction<{ status: 'PENDING' }>('auth', 'requestTrainerStatus', message ? { message } : {}),
  requestUserCategory: (categoryKey: string, message?: string) =>
    callAction<{ status: 'PENDING' }>('auth', 'requestUserCategory', { categoryKey, ...(message ? { message } : {}) }),
  getMyCategoryStatus: () =>
    callAction<{ trainerApplication: MyTrainerApplication | null; categoryMemberships: MyCategoryMembership[] }>(
      'auth',
      'getMyCategoryStatus'
    ),
};
