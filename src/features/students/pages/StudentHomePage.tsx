import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { listAvailableQuizzes } from '../api/studentContentApi';
import { useAuthStore } from '@/features/auth/store/useAuthStore';

export function StudentHomePage() {
  const uid = useAuthStore((s) => s.firebaseUser?.uid);

  const { data: quizzes } = useQuery({ queryKey: ['student', 'availableQuizzes'], queryFn: listAvailableQuizzes });
  const { data: myAttempts } = useQuery({
    queryKey: ['student', 'myQuizAttempts', uid],
    queryFn: async () => {
      const snap = await getDocs(query(collection(db, 'quizAttempts'), where('userId', '==', uid)));
      return snap.docs.map((d) => {
        const data = d.data();
        return { quizId: data.quizId as string, status: data.status as string };
      });
    },
    enabled: !!uid,
  });

  const attemptByQuizId = new Map((myAttempts ?? []).map((a) => [a.quizId, a]));

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">📄 Available Quizzes</div>
      {(!quizzes || quizzes.length === 0) && (
        <p className="rounded-xl border border-dashed border-surface-border p-6 text-center text-sm text-neutral-500">
          No quizzes are available right now.
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {quizzes?.map((quiz) => {
          const attempt = attemptByQuizId.get(quiz.id);
          const notYetOpen = quiz.scheduledStart && quiz.scheduledStart.toMillis() > Date.now();
          return (
            <div key={quiz.id} className="rounded-xl border border-surface-border bg-surface-raised p-5">
              <h3 className="mb-1 font-semibold text-white">{quiz.title}</h3>
              <div className="mb-4 space-y-0.5 text-sm text-neutral-500">
                <div>{quiz.totalQuestions} questions</div>
                <div>{quiz.durationMinutes} min</div>
              </div>
              {notYetOpen ? (
                <span className="text-sm text-neutral-500">Opens {new Date(quiz.scheduledStart!.toMillis()).toLocaleString()}</span>
              ) : attempt?.status === 'in_progress' ? (
                <Link to={`/quizzes/${quiz.id}/take`} className="block rounded-lg bg-brand-gradient py-2 text-center text-sm font-medium text-surface">
                  Resume
                </Link>
              ) : attempt ? (
                <span className="rounded-lg bg-neutral-800 px-3 py-2 text-sm text-neutral-400">Already attempted</span>
              ) : (
                <Link to={`/quizzes/${quiz.id}/take`} className="block rounded-lg bg-brand-gradient py-2 text-center text-sm font-medium text-surface">
                  Start Quiz
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
