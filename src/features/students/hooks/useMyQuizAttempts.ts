import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/features/auth/store/useAuthStore';

export interface MyQuizAttempt {
  quizId: string;
  quizTitle: string | null;
  status: string;
  answeredCount: number;
  totalQuestions: number;
  startedAtMs: number;
}

// `quizAttempts where userId == uid` - the exact same read that used to be
// hand-rolled in StudentHomePage, ProfileActivitySections and (scoped)
// QuizDetailPage. One query key so React Query dedupes it across the page.
export function useMyQuizAttempts() {
  const uid = useAuthStore((s) => s.firebaseUser?.uid);
  return useQuery({
    queryKey: ['student', 'myQuizAttemptsFull', uid],
    enabled: !!uid,
    queryFn: async (): Promise<MyQuizAttempt[]> => {
      const snap = await getDocs(query(collection(db, 'quizAttempts'), where('userId', '==', uid)));
      return snap.docs.map((d) => {
        const data = d.data();
        return {
          quizId: data.quizId as string,
          quizTitle: (data.quizTitle as string | undefined) ?? null,
          status: data.status as string,
          answeredCount: (data.answeredCount as number) ?? 0,
          totalQuestions: (data.totalQuestions as number) ?? 0,
          startedAtMs: (data.startedAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0,
        };
      });
    },
  });
}
