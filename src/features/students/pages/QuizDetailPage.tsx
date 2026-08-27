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
import { RelatedItems } from '@/components/common/RelatedItems';
import { PreviewQuestions } from '@/components/common/PreviewQuestions';
import { WishlistButton } from '@/components/common/WishlistButton';

// A fixed 10-question free sample regardless of the admin's own
// previewQuestionCount setting — same convention as PracticeTestDetailPage,
// on request, so every visitor sees the same "try 10 questions" experience.
const SAMPLE_PREVIEW_COUNT = 10;

// The "course landing page" a student sees before (or after) buying a
// quiz, reached by clicking a card on MockExamsPage/MyPurchasesPage rather
// than acting on the card's buttons directly. Laid out the same way as
// PracticeTestDetailPage (plain heading + description in a main column, a
// sticky sidebar for the cover/price/actions) instead of one big bordered
// card, so the two "course landing pages" in the app read as one design
// system rather than two different layouts.
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
        <Link to="/home/mock-exams" className="rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted hover:border-brand-400">
          Back to Mock Exams
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
  const previewCount = quiz.previewQuestionCount === 0 ? 0 : SAMPLE_PREVIEW_COUNT;

  return (
    <div className="mx-auto max-w-6xl">
      <Link to="/home/mock-exams" className="mb-4 inline-block text-sm text-brand-ink hover:underline">
        ← Back to Mock Exams
      </Link>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        {/* Main column — heading, description, all the details, then the
            free sample or reviews below. No bordered card wrapping this,
            same as PracticeTestDetailPage. */}
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs uppercase tracking-wide text-ink-faint">
            <span>{quiz.category ?? 'Other'}</span>
            <span>·</span>
            <span>{quiz.skillLevel ?? 'Foundation'}</span>
          </div>
          <h1 className="mb-2 text-3xl font-bold leading-tight text-ink">{quiz.title}</h1>

          {(quiz.ratingCount ?? 0) > 0 && (
            <div className="mb-3 flex items-center gap-2">
              <StarRating value={quiz.ratingAvg ?? 0} size="sm" />
              <span className="text-sm text-ink-faint">
                {(quiz.ratingAvg ?? 0).toFixed(1)} ({quiz.ratingCount} review{quiz.ratingCount === 1 ? '' : 's'})
              </span>
            </div>
          )}

          <div className="mb-6 flex flex-wrap gap-4 text-sm text-ink-faint">
            <span>📄 {quiz.totalQuestions} questions</span>
            <span>⏱ {quiz.durationMinutes} min</span>
          </div>

          {quiz.description && (
            <div className="mb-6">
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-faint">About this quiz</h2>
              <p className="whitespace-pre-line text-sm text-ink-muted">{quiz.description}</p>
            </div>
          )}

          {/* Same fixed 10 questions, same order, for every visitor every
              time — see getQuizPreviewQuestions's orderBy('order'). */}
          {!owned && previewCount > 0 && (
            <PreviewQuestions itemType="quiz" itemId={quiz.id} previewQuestionCount={previewCount} />
          )}

          <RelatedItems category={quiz.category ?? 'Other'} excludeItemType="quiz" excludeItemId={quiz.id} />
          <ReviewsSection itemType="quiz" itemId={quiz.id} owned={owned} />
        </div>

        {/* Sidebar — cover thumbnail, price, and every action, sticky so it
            stays visible while the main column's description/reviews
            scroll past it. */}
        <div className="lg:sticky lg:top-20">
          <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-raised">
            <CourseCoverImage id={quiz.id} title={quiz.title} className="h-36 w-full" />
            <div className="p-5">
              {price > 0 && (
                <div className="mb-4 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {quiz.originalPrice && quiz.originalPrice > price && (
                      <span className="text-sm text-ink-faint line-through">{formatMoney(quiz.originalPrice, quiz.currency)}</span>
                    )}
                    <span className="text-xl font-bold text-ink">{formatMoney(price, quiz.currency)}</span>
                  </div>
                  {!owned && <WishlistButton itemType="quiz" itemId={quiz.id} variant="inline" />}
                </div>
              )}

              {!owned ? (
                inCart ? (
                  <Link
                    to="/home/cart"
                    className="block rounded-lg border border-[#1D4ED8]/50 py-2.5 text-center text-sm font-medium text-[#1D4ED8]"
                  >
                    ✓ In Cart · View Cart
                  </Link>
                ) : (
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      disabled={paying}
                      onClick={() => setShowBuyNow(true)}
                      className="w-full rounded-lg bg-[#1D4ED8] py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
                    >
                      {paying ? 'Opening…' : 'Buy Now'}
                    </button>
                    <button
                      type="button"
                      disabled={addToCartMutation.isPending || paying}
                      onClick={() => addToCartMutation.mutate(quiz.id)}
                      className="w-full rounded-lg border border-surface-border py-2.5 text-sm font-medium text-ink-muted hover:opacity-80 disabled:opacity-60"
                    >
                      Add to Cart
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
                  className="block rounded-lg bg-[#1D4ED8] py-2.5 text-center text-sm font-medium text-surface"
                >
                  Resume
                </Link>
              ) : attempt ? (
                <span className="block rounded-lg bg-neutral-800 px-3 py-2.5 text-center text-sm text-ink-faint">Already attempted</span>
              ) : (
                <Link
                  to={`/quizzes/${quiz.id}/take`}
                  className="block rounded-lg bg-[#1D4ED8] py-2.5 text-center text-sm font-medium text-surface"
                >
                  Start Quiz
                </Link>
              )}
            </div>
          </div>
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
