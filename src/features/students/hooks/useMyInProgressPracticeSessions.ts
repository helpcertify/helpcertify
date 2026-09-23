import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { listPracticeTestsBucketed } from '../api/studentContentApi';

export interface InProgressPracticeSession {
  testId: string;
  testTitle: string | null;
  answeredCount: number;
  batchSize: number;
  startedAtMs: number;
}

// `practiceSessions where userId == uid`, filtered to in_progress client
// side (equality-only query, guaranteed single-field index - same pattern
// as PracticeTestsPage), joined to the practice test's title for display.
export function useMyInProgressPracticeSessions() {
  const uid = useAuthStore((s) => s.firebaseUser?.uid);
  const { data: buckets } = useQuery({ queryKey: ['student', 'practiceTests'], queryFn: listPracticeTestsBucketed });

  return useQuery({
    queryKey: ['student', 'myInProgressPracticeSessions', uid, (buckets?.available ?? []).length],
    enabled: !!uid,
    queryFn: async (): Promise<InProgressPracticeSession[]> => {
      const snap = await getDocs(query(collection(db, 'practiceSessions'), where('userId', '==', uid)));
      const titleByTestId = new Map(
        [...(buckets?.available ?? []), ...(buckets?.upcoming ?? []), ...(buckets?.expired ?? [])].map((t) => [t.id, t.title]),
      );
      return snap.docs
        .map((d) => d.data())
        .filter((x) => x.status === 'in_progress')
        .map((x) => ({
          testId: x.testId as string,
          testTitle: titleByTestId.get(x.testId as string) ?? null,
          answeredCount: (x.answeredCount as number) ?? 0,
          batchSize: ((x.batchQuestionIds as string[]) ?? []).length,
          startedAtMs: (x.startedAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0,
        }))
        .sort((a, b) => b.startedAtMs - a.startedAtMs);
    },
  });
}
