import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { listAvailableQuizzes } from '../api/studentContentApi';
import { cartApi } from '../api/cartApi';
import { useCheckout } from '../hooks/useCheckout';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { useUiStore } from '@/store/useUiStore';
import { formatMoney } from '@/utils/currency';
import { BuyNowModal } from '@/components/common/BuyNowModal';
import { CourseCoverImage } from '@/components/common/CourseCoverImage';
import { StarRating } from '@/components/common/StarRating';
import { WishlistButton } from '@/components/common/WishlistButton';
import { ExamFilterBar, DEFAULT_EXAM_FILTERS, matchesExamFilters } from '@/components/common/ExamFilterBar';
import type { QuizDoc } from '@/types/models';

// Full-length, timed exam simulations — this is the content that used to
// sit directly on the Home page ("Quiz Library"/"Available Quizzes"); moved
// to its own tab so Home could become an actual personalized dashboard
// instead of just this grid. Same owned/in-cart/buy-now/start-resume logic
// as before, plus a filter bar (provider/level/price/status/search) that
// replaces the old standalone Categories tab.
export function MockExamsPage() {
  const uid = useAuthStore((s) => s.firebaseUser?.uid);
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const { checkout, paying, confirmation } = useCheckout();
  const [buyNowQuiz, setBuyNowQuiz] = useState<(QuizDoc & { id: string }) | null>(null);
  const [filters, setFilters] = useState(DEFAULT_EXAM_FILTERS);

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

  const filtered = (quizzes ?? []).filter((quiz) => {
    const attempt = attemptByQuizId.get(quiz.id);
    const status = attempt?.status === 'in_progress' ? 'in_progress' : attempt ? 'completed' : 'not_started';
    return matchesExamFilters(
      filters,
      { title: quiz.title, category: quiz.category ?? 'Other', skillLevel: quiz.skillLevel ?? 'Foundation', price: quiz.price ?? 0 },
      status
    );
  });

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
      <h1 className="mb-1 text-2xl font-bold text-ink">Mock Exams</h1>
      <p className="mb-6 text-sm text-ink-faint">Full-length, timed exam simulations.</p>

      <ExamFilterBar filters={filters} onChange={setFilters} />

      {(!quizzes || quizzes.length === 0) && (
        <p className="rounded-xl border border-dashed border-surface-border p-6 text-center text-sm text-ink-faint">
          No mock exams are available right now.
        </p>
      )}
      {quizzes && quizzes.length > 0 && filtered.length === 0 && (
        <p className="rounded-xl border border-dashed border-surface-border p-6 text-center text-sm text-ink-faint">
          Nothing matches those filters. Try clearing the search or picking "All".
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((quiz) => {
          const attempt = attemptByQuizId.get(quiz.id);
          const notYetOpen = quiz.scheduledStart && quiz.scheduledStart.toMillis() > Date.now();
          const price = quiz.price ?? 0;
          const owned = price === 0 || purchasedSet.has(`quiz_${quiz.id}`);
          const inCart = inCartSet.has(`quiz_${quiz.id}`);

          return (
            <div key={quiz.id} className="overflow-hidden rounded-xl border border-surface-border bg-surface-raised">
              <Link to={`/home/quizzes/${quiz.id}`}>
                <CourseCoverImage id={quiz.id} title={quiz.title} className="h-20 w-full" />
              </Link>
              {/* Card body sits on the plain surface-raised background, unlike
                  the colorful cover banner above — the heart lives here now
                  (variant="inline") since it was unreadable against some of
                  the banner's brighter gradient pairs. */}
              <div className="relative p-3.5">
                {!owned && <WishlistButton itemType="quiz" itemId={quiz.id} variant="inline" className="absolute right-2.5 top-2.5" />}
              <div className="mb-0.5 flex flex-wrap items-center gap-1.5 pr-8 text-xs uppercase tracking-wide text-ink-faint">
                <span>{quiz.category ?? 'Other'}</span>
                <span>·</span>
                <span>{quiz.skillLevel ?? 'Foundation'}</span>
              </div>
              <Link to={`/home/quizzes/${quiz.id}`} className="hover:text-brand-ink">
                <h3 className="mb-0.5 line-clamp-2 pr-8 text-sm font-bold leading-snug text-ink">{quiz.title}</h3>
              </Link>
              {(quiz.ratingCount ?? 0) > 0 && (
                <div className="mb-1 flex items-center gap-1.5">
                  <StarRating value={quiz.ratingAvg ?? 0} size="sm" />
                  <span className="text-xs text-ink-faint">
                    {(quiz.ratingAvg ?? 0).toFixed(1)} ({quiz.ratingCount})
                  </span>
                </div>
              )}
              <div className="mb-2 text-xs text-ink-faint">
                {quiz.totalQuestions} questions · {quiz.durationMinutes} min
              </div>

              {price > 0 && (
                <div className="mb-2 flex items-center gap-2">
                  {quiz.originalPrice && quiz.originalPrice > price && (
                    <span className="text-xs text-ink-faint line-through">{formatMoney(quiz.originalPrice, quiz.currency)}</span>
                  )}
                  <span className="font-semibold text-ink">{formatMoney(price, quiz.currency)}</span>
                </div>
              )}

              {!owned ? (
                inCart ? (
                  <Link
                    to="/home/cart"
                    className="block rounded-lg border border-blue-500/50 py-1.5 text-center text-sm font-medium text-blue-700 dark:text-blue-300"
                  >
                    ✓ In Cart · View Cart
                  </Link>
                ) : (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={addToCartMutation.isPending || paying}
                      onClick={() => addToCartMutation.mutate(quiz.id)}
                      className="flex-1 rounded-lg border border-surface-border py-1.5 text-sm font-medium text-ink-muted hover:border-blue-400 disabled:opacity-60"
                    >
                      Add to Cart
                    </button>
                    <button
                      type="button"
                      disabled={paying}
                      onClick={() => setBuyNowQuiz(quiz)}
                      className="flex-1 rounded-lg bg-blue-600 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
                    >
                      {paying ? 'Opening…' : 'Buy Now'}
                    </button>
                  </div>
                )
              ) : notYetOpen ? (
                <span className="text-sm text-ink-faint">Opens {new Date(quiz.scheduledStart!.toMillis()).toLocaleString()}</span>
              ) : attempt?.status === 'in_progress' ? (
                <Link to={`/quizzes/${quiz.id}/take`} className="block rounded-lg bg-brand-gradient py-1.5 text-center text-sm font-medium text-surface">
                  Resume
                </Link>
              ) : attempt ? (
                <span className="rounded-lg bg-neutral-800 px-3 py-1.5 text-sm text-ink-faint">Already attempted</span>
              ) : (
                <Link to={`/quizzes/${quiz.id}/take`} className="block rounded-lg bg-brand-gradient py-1.5 text-center text-sm font-medium text-surface">
                  Start Quiz
                </Link>
              )}
              </div>
            </div>
          );
        })}
      </div>

      {buyNowQuiz && (
        <BuyNowModal
          title={buyNowQuiz.title}
          price={buyNowQuiz.price ?? 0}
          originalPrice={buyNowQuiz.originalPrice ?? null}
          currency={buyNowQuiz.currency ?? 'INR'}
          paying={paying}
          onClose={() => setBuyNowQuiz(null)}
          onConfirm={(couponCode) => {
            checkout({
              buyNowItem: { itemType: 'quiz', itemId: buyNowQuiz.id },
              items: [{ itemType: 'quiz', itemId: buyNowQuiz.id, title: buyNowQuiz.title }],
              couponCode,
            });
            setBuyNowQuiz(null);
          }}
        />
      )}
      {confirmation}
    </div>
  );
}
