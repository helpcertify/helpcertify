import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { listAvailableQuizzes } from '../api/studentContentApi';
import { cartApi } from '../api/cartApi';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { useUiStore } from '@/store/useUiStore';
import { formatINR } from '@/utils/currency';

export function StudentHomePage() {
  const uid = useAuthStore((s) => s.firebaseUser?.uid);
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);

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
  const { data: purchases } = useQuery({ queryKey: ['student', 'purchases'], queryFn: cartApi.listMyPurchases });
  const { data: cart } = useQuery({ queryKey: ['student', 'cart'], queryFn: cartApi.getCart });

  const attemptByQuizId = new Map((myAttempts ?? []).map((a) => [a.quizId, a]));
  const purchasedSet = new Set((purchases?.purchases ?? []).map((p) => `${p.itemType}_${p.itemId}`));
  const inCartSet = new Set((cart?.items ?? []).map((i) => `${i.itemType}_${i.itemId}`));

  const addToCartMutation = useMutation({
    mutationFn: (quizId: string) => cartApi.addItem('quiz', quizId),
    onSuccess: (data) => {
      queryClient.setQueryData(['student', 'cart'], data);
      pushToast('Added to cart', 'success');
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : 'Could not add to cart', 'error'),
  });

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
          const price = quiz.price ?? 0;
          const owned = price === 0 || purchasedSet.has(`quiz_${quiz.id}`);
          const inCart = inCartSet.has(`quiz_${quiz.id}`);

          return (
            <div key={quiz.id} className="rounded-xl border border-surface-border bg-surface-raised p-5">
              <h3 className="mb-1 font-semibold text-white">{quiz.title}</h3>
              <div className="mb-3 space-y-0.5 text-sm text-neutral-500">
                <div>{quiz.totalQuestions} questions</div>
                <div>{quiz.durationMinutes} min</div>
              </div>

              {price > 0 && (
                <div className="mb-3 flex items-center gap-2">
                  {quiz.originalPrice && quiz.originalPrice > price && (
                    <span className="text-xs text-neutral-500 line-through">{formatINR(quiz.originalPrice)}</span>
                  )}
                  <span className="font-semibold text-white">{formatINR(price)}</span>
                </div>
              )}

              {!owned ? (
                inCart ? (
                  <Link
                    to="/home/cart"
                    className="block rounded-lg border border-blue-500/50 py-2 text-center text-sm font-medium text-blue-300"
                  >
                    ✓ In Cart — View Cart
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled={addToCartMutation.isPending}
                    onClick={() => addToCartMutation.mutate(quiz.id)}
                    className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
                  >
                    Add to Cart
                  </button>
                )
              ) : notYetOpen ? (
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
