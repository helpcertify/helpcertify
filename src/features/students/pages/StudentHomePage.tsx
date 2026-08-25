import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { listAvailableQuizzes, listPracticeTestsBucketed } from '../api/studentContentApi';
import { cartApi } from '../api/cartApi';
import { useCheckout } from '../hooks/useCheckout';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { useUiStore } from '@/store/useUiStore';
import { formatMoney } from '@/utils/currency';
import { BuyNowModal } from '@/components/common/BuyNowModal';
import { CourseCoverImage } from '@/components/common/CourseCoverImage';
import { StarRating } from '@/components/common/StarRating';
import { WishlistButton } from '@/components/common/WishlistButton';
import { CourseCarousel, type CarouselItem } from '@/components/common/CourseCarousel';
import type { QuizDoc } from '@/types/models';

export function StudentHomePage() {
  const uid = useAuthStore((s) => s.firebaseUser?.uid);
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const { checkout, paying, confirmation } = useCheckout();
  const [buyNowQuiz, setBuyNowQuiz] = useState<(QuizDoc & { id: string }) | null>(null);

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

  // "Continue Learning" pulls from both quiz attempts and practice test
  // progress — this page previously only ever showed quizzes, so a
  // part-finished practice test never surfaced here at all, only on its own
  // Practice Tests page.
  const { data: practiceBuckets } = useQuery({ queryKey: ['student', 'practiceTests'], queryFn: listPracticeTestsBucketed });
  const { data: practiceProgressDocs } = useQuery({
    queryKey: ['student', 'practiceProgress', uid],
    queryFn: async () => {
      const snap = await getDocs(query(collection(db, 'practiceProgress'), where('userId', '==', uid)));
      return snap.docs.map((d) => {
        const data = d.data();
        return { testId: data.testId as string, answeredQuestionIds: (data.answeredQuestionIds as string[]) ?? [] };
      });
    },
    enabled: !!uid,
  });

  const attemptByQuizId = new Map((myAttempts ?? []).map((a) => [a.quizId, a]));
  const purchasedSet = new Set((purchases?.purchases ?? []).map((p) => `${p.itemType}_${p.itemId}`));
  const inCartSet = new Set((cart?.items ?? []).map((i) => `${i.itemType}_${i.itemId}`));

  const inProgressQuizzes = (quizzes ?? [])
    .filter((q) => attemptByQuizId.get(q.id)?.status === 'in_progress')
    .map((q) => ({ itemType: 'quiz' as const, id: q.id, title: q.title, href: `/quizzes/${q.id}/take`, progress: null as string | null }));

  const practiceTestById = new Map((practiceBuckets?.available ?? []).map((t) => [t.id, t]));
  const inProgressPracticeTests = (practiceProgressDocs ?? [])
    .map((p) => {
      const test = practiceTestById.get(p.testId);
      if (!test) return null;
      const answered = p.answeredQuestionIds.length;
      if (answered === 0 || answered >= test.totalQuestions) return null; // not started, or already finished this bank
      return {
        itemType: 'practiceTest' as const,
        id: p.testId,
        title: test.title,
        href: `/practice-tests/${p.testId}/take`,
        progress: `${answered}/${test.totalQuestions} answered`,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const continueItems = [...inProgressQuizzes, ...inProgressPracticeTests];

  // "Recommended for you" — ranked by rating (falls back to catalog order
  // when nothing has a rating yet, e.g. a fresh platform with no reviews),
  // capped to 10. Not personalized in any real sense yet (no click/purchase
  // history feeds this), just the same honest "best of the catalog" signal
  // as everywhere else ratings show up in this app.
  const recommended: CarouselItem[] = [...(quizzes ?? [])]
    .sort((a, b) => (b.ratingAvg ?? 0) * (b.ratingCount ?? 0) - (a.ratingAvg ?? 0) * (a.ratingCount ?? 0))
    .slice(0, 10)
    .map((q) => ({
      itemType: 'quiz' as const,
      id: q.id,
      title: q.title,
      category: q.category ?? 'Other',
      skillLevel: q.skillLevel ?? 'Foundation',
      price: q.price ?? 0,
      originalPrice: q.originalPrice ?? null,
      currency: q.currency ?? 'INR',
      ratingAvg: q.ratingAvg ?? 0,
      ratingCount: q.ratingCount ?? 0,
    }));

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
      {continueItems.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-lg font-bold text-ink">▶ Continue Learning</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {continueItems.map((item) => (
              <Link
                key={`${item.itemType}_${item.id}`}
                to={item.href}
                className="flex items-center justify-between gap-3 rounded-xl border border-brand-400 bg-brand-500/10 p-4 hover:bg-brand-500/15"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-ink">{item.title}</div>
                  <div className="text-xs text-ink-faint">{item.progress ?? 'In progress'}</div>
                </div>
                <span className="shrink-0 text-sm font-medium text-brand-ink">Resume →</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <CourseCarousel title="Recommended for you" items={recommended} />

      <div className="mb-4 flex items-center gap-2 text-lg font-semibold text-ink">📄 Quiz Library</div>
      {(!quizzes || quizzes.length === 0) && (
        <p className="rounded-xl border border-dashed border-surface-border p-6 text-center text-sm text-ink-faint">
          No quizzes are available right now.
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {quizzes?.map((quiz) => {
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
                    className="block rounded-lg border border-blue-500/50 py-1.5 text-center text-sm font-medium text-blue-300"
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
