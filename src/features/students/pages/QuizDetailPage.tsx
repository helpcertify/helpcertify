import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getQuizById } from '../api/studentContentApi';
import { cartApi } from '../api/cartApi';
import { useCheckout } from '../hooks/useCheckout';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { useUiStore } from '@/store/useUiStore';
import { formatMoney } from '@/utils/currency';
import { BuyNowModal } from '@/components/common/BuyNowModal';
import { CourseCoverImage } from '@/components/common/CourseCoverImage';
import { StarRating } from '@/components/common/StarRating';
import { ReviewsSection } from '@/components/common/ReviewsSection';

// The "course landing page" a student sees before (or after) buying a quiz,
// reached by clicking a card on StudentHomePage/CategoriesPage/
// MyPurchasesPage rather than acting on the card's buttons directly. Same
// owned/in-cart/notYetOpen/attempted branches as StudentHomePage's card,
// just laid out as a full page with room for the description ("About this
// quiz") that doesn't fit on a browse card.
export function QuizDetailPage() {
  const { quizId } = useParams<{ quizId: string }>();
  const uid = useAuthStore((s) => s.firebaseUser?.uid);
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const { checkout, paying, confirmation } = useCheckout();
  const [showBuyNow, setShowBuyNow] = useState(false);

  const { data: quiz, isLoading } = useQuery({
    queryKey: ['student', 'quiz', quizId],
    queryFn: () => getQuizById(quizId!),
    enabled: !!quizId,
  });
  const { data: attempt } = useQuery({
    queryKey: ['student', 'myQuizAttempt', uid, quizId],
    queryFn: async () => {
      const snap = await getDocs(
        query(collection(db, 'quizAttempts'), where('userId', '==', uid), where('quizId', '==', quizId))
      );
      if (snap.empty) return null;
      return { status: snap.docs[0].data().status as string };
    },
    enabled: !!uid && !!quizId,
  });
  const { data: purchases } = useQuery({ queryKey: ['student', 'purchases'], queryFn: cartApi.listMyPurchases });
  const { data: cart } = useQuery({ queryKey: ['student', 'cart'], queryFn: cartApi.getCart });

  const addToCartMutation = useMutation({
    mutationFn: (id: string) => cartApi.addItem('quiz', id),
    onSuccess: (data) => {
      queryClient.setQueryData(['student', 'cart'], data);
      pushToast('Added to cart', 'success');
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : 'Could not add to cart', 'error'),
  });

  if (isLoading) {
    return <p className="text-sm text-ink-faint">Loading…</p>;
  }
  if (!quiz) {
    return (
      <div className="rounded-xl border border-dashed border-surface-border p-8 text-center">
        <p className="mb-4 text-ink-faint">This quiz doesn't exist or is no longer available.</p>
        <Link to="/home" className="rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted hover:border-brand-400">
          Back to Available Quizzes
        </Link>
      </div>
    );
  }

  const price = quiz.price ?? 0;
  const purchasedSet = new Set((purchases?.purchases ?? []).map((p) => `${p.itemType}_${p.itemId}`));
  const inCartSet = new Set((cart?.items ?? []).map((i) => `${i.itemType}_${i.itemId}`));
  const owned = price === 0 || purchasedSet.has(`quiz_${quiz.id}`);
  const inCart = inCartSet.has(`quiz_${quiz.id}`);
  const notYetOpen = quiz.scheduledStart && quiz.scheduledStart.toMillis() > Date.now();

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/home" className="mb-4 inline-block text-sm text-ink-faint hover:text-brand-ink">
        ← Back to Available Quizzes
      </Link>

      <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-raised">
        <CourseCoverImage id={quiz.id} title={quiz.title} className="h-56 w-full" />
        <div className="p-6">
          <div className="mb-2 text-xs uppercase tracking-wide text-ink-faint">{quiz.category ?? 'Other'}</div>
          <h1 className="mb-2 text-2xl font-bold text-ink">{quiz.title}</h1>

          {(quiz.ratingCount ?? 0) > 0 && (
            <div className="mb-3 flex items-center gap-2">
              <StarRating value={quiz.ratingAvg ?? 0} size="sm" />
              <span className="text-sm text-ink-faint">
                {(quiz.ratingAvg ?? 0).toFixed(1)} ({quiz.ratingCount} review{quiz.ratingCount === 1 ? '' : 's'})
              </span>
            </div>
          )}

          <div className="mb-5 flex flex-wrap gap-4 text-sm text-ink-faint">
            <span>📄 {quiz.totalQuestions} questions</span>
            <span>⏱ {quiz.durationMinutes} min</span>
          </div>

          {quiz.description && (
            <div className="mb-6">
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-faint">About this quiz</h2>
              <p className="whitespace-pre-line text-sm text-ink-muted">{quiz.description}</p>
            </div>
          )}

          <div className="rounded-xl border border-surface-border bg-surface p-5">
            {price > 0 && (
              <div className="mb-4 flex items-center gap-2">
                {quiz.originalPrice && quiz.originalPrice > price && (
                  <span className="text-sm text-ink-faint line-through">{formatMoney(quiz.originalPrice, quiz.currency)}</span>
                )}
                <span className="text-xl font-bold text-ink">{formatMoney(price, quiz.currency)}</span>
              </div>
            )}

            {!owned ? (
              inCart ? (
                <Link
                  to="/home/cart"
                  className="block rounded-lg border border-blue-500/50 py-2.5 text-center text-sm font-medium text-blue-300"
                >
                  ✓ In Cart · View Cart
                </Link>
              ) : (
                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled={addToCartMutation.isPending || paying}
                    onClick={() => addToCartMutation.mutate(quiz.id)}
                    className="flex-1 rounded-lg border border-surface-border py-2.5 text-sm font-medium text-ink-muted hover:border-blue-400 disabled:opacity-60"
                  >
                    Add to Cart
                  </button>
                  <button
                    type="button"
                    disabled={paying}
                    onClick={() => setShowBuyNow(true)}
                    className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
                  >
                    {paying ? 'Opening…' : 'Buy Now'}
                  </button>
                </div>
              )
            ) : notYetOpen ? (
              <span className="block text-center text-sm text-ink-faint">
                Opens {new Date(quiz.scheduledStart!.toMillis()).toLocaleString()}
              </span>
            ) : attempt?.status === 'in_progress' ? (
              <Link
                to={`/quizzes/${quiz.id}/take`}
                className="block rounded-lg bg-brand-gradient py-2.5 text-center text-sm font-medium text-surface"
              >
                Resume
              </Link>
            ) : attempt ? (
              <span className="block rounded-lg bg-neutral-800 px-3 py-2.5 text-center text-sm text-ink-faint">Already attempted</span>
            ) : (
              <Link
                to={`/quizzes/${quiz.id}/take`}
                className="block rounded-lg bg-brand-gradient py-2.5 text-center text-sm font-medium text-surface"
              >
                Start Quiz
              </Link>
            )}
          </div>

          <ReviewsSection itemType="quiz" itemId={quiz.id} owned={owned} />
        </div>
      </div>

      {showBuyNow && (
        <BuyNowModal
          title={quiz.title}
          price={price}
          originalPrice={quiz.originalPrice ?? null}
          currency={quiz.currency ?? 'INR'}
          paying={paying}
          onClose={() => setShowBuyNow(false)}
          onConfirm={(couponCode) => {
            checkout({
              buyNowItem: { itemType: 'quiz', itemId: quiz.id },
              items: [{ itemType: 'quiz', itemId: quiz.id, title: quiz.title }],
              couponCode,
            });
            setShowBuyNow(false);
          }}
        />
      )}
      {confirmation}
    </div>
  );
}
