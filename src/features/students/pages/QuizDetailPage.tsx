import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { getQuizById } from '../api/studentContentApi';
import { useMyQuizAttempts } from '../hooks/useMyQuizAttempts';
import { cartApi } from '../api/cartApi';
import { useCheckout } from '../hooks/useCheckout';
import { useUiStore } from '@/store/useUiStore';
import { formatMoney } from '@/utils/currency';
import { BuyNowModal } from '@/components/common/BuyNowModal';
import { Spinner } from '@/components/common/Spinner';
import { CourseIcon } from '@/components/common/CourseIcon';
import { StarRating } from '@/components/common/StarRating';
import { ReviewsSection } from '@/components/common/ReviewsSection';
import { PreviewQuestions } from '@/components/common/PreviewQuestions';
import { FreePreviewCallout } from '@/components/common/FreePreviewCallout';
import { WishlistButton } from '@/components/common/WishlistButton';
import { activePurchaseKeys } from '../lib/purchaseAccess';
import { errorText } from '@/lib/errorMessages';

// A fixed 10-question free sample regardless of the admin's own
// previewQuestionCount setting - same convention as PracticeTestDetailPage,
// on request, so every visitor sees the same "try 10 questions" experience.
const SAMPLE_PREVIEW_COUNT = 10;

// Master HelpCertify design-system layout - same visual language as
// PracticeTestDetailPage (full-width header card, two-column Course
// Access + Free Preview, full-width Reviews). Purely a visual pass; the
// underlying data/mutations are unchanged from before this restyle.
export function QuizDetailPage() {
  const { quizId } = useParams<{ quizId: string }>();
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const { checkout, paying, confirmation } = useCheckout();
  const [showBuyNow, setShowBuyNow] = useState(false);

  const { data: quiz, isLoading } = useQuery({
    queryKey: ['student', 'quiz', quizId],
    queryFn: () => getQuizById(quizId!),
    enabled: !!quizId,
  });
  const { data: myAttempts } = useMyQuizAttempts();
  const attempt = myAttempts?.find((a) => a.quizId === quizId) ?? null;
  const { data: purchases } = useQuery({ queryKey: ['student', 'purchases'], queryFn: cartApi.listMyPurchases });
  const { data: cart } = useQuery({ queryKey: ['student', 'cart'], queryFn: cartApi.getCart });

  const addToCartMutation = useMutation({
    mutationFn: (id: string) => cartApi.addItem('quiz', id),
    onSuccess: (data) => {
      queryClient.setQueryData(['student', 'cart'], data);
      pushToast('Added to cart', 'success');
    },
    onError: (err) => pushToast(errorText(err, 'Could not add to cart'), 'error'),
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
  const purchasedSet = activePurchaseKeys(purchases?.purchases);
  const inCartSet = new Set((cart?.items ?? []).map((i) => `${i.itemType}_${i.itemId}`));
  const owned = purchasedSet.has(`quiz_${quiz.id}`) || (price === 0 && !quiz.requiresEntitlement);
  const inCart = inCartSet.has(`quiz_${quiz.id}`);
  const notYetOpen = quiz.scheduledStart && quiz.scheduledStart.toMillis() > Date.now();
  const previewCount = quiz.previewQuestionCount === 0 ? 0 : SAMPLE_PREVIEW_COUNT;

  return (
    // Fills the width StudentShell's sidebar leaves available (up to a
    // 1440px cap) instead of centering a much-narrower fixed column inside
    // it - same fix as PracticeTestDetailPage, same underlying cause.
    <div className="mx-auto w-full max-w-[1640px]">
      <Link to="/home/mock-exams" className="mb-4 inline-block text-sm text-brand-ink hover:underline">
        ← Back to Mock Exams
      </Link>

      {/* Header - full width, badges/title/rating/stats on the left, a
          decorative certification mark on the right. */}
      <div className="mb-6 flex flex-col justify-between gap-6 rounded-xl border border-surface-border bg-surface-raised p-6 shadow-card sm:flex-row sm:items-center">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">
            <span>{quiz.category ?? 'Other'}</span>
            <span>·</span>
            <span>{quiz.skillLevel ?? 'Foundation'}</span>
          </div>
          <h1 className="mb-2 text-[28px] font-bold leading-tight text-ink">{quiz.title}</h1>

          {(quiz.ratingCount ?? 0) > 0 && (
            <div className="mb-3 flex items-center gap-2">
              <StarRating value={quiz.ratingAvg ?? 0} size="sm" />
              <span className="text-sm text-ink-faint">
                {(quiz.ratingAvg ?? 0).toFixed(1)} ({quiz.ratingCount} review{quiz.ratingCount === 1 ? '' : 's'})
              </span>
            </div>
          )}

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
            <span>▣ {quiz.totalQuestions} Questions</span>
            <span>◷ {quiz.durationMinutes} min</span>
          </div>

          {quiz.description && (
            <p className="mt-4 max-w-[760px] whitespace-pre-line text-sm leading-relaxed text-ink">{quiz.description}</p>
          )}
        </div>

        <div className="hidden shrink-0 items-center justify-center rounded-xl bg-brand-50 p-6 sm:flex">
          <div className="scale-[1.8]">
            <CourseIcon id={quiz.id} title={quiz.title} itemType="quiz" />
          </div>
        </div>
      </div>

      {/* Course Access + Free Preview when not owned; Course Access alone
          (centered, capped width) when owned - there's no practice-setup/
          study-plan equivalent for a timed Mock Exam. */}
      <div className={`mb-6 grid grid-cols-1 gap-6 ${!owned && previewCount > 0 ? 'lg:grid-cols-[0.7fr_1.3fr] lg:items-start' : ''}`}>
        <div className={!owned && previewCount > 0 ? '' : 'max-w-sm'}>
          <div className="rounded-xl border border-surface-border bg-surface-raised p-6 shadow-card">
            <h2 className="mb-4 text-[15px] font-bold uppercase tracking-wide text-brand-ink">Course Access</h2>

            {price > 0 && (
              <div className="mb-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {quiz.originalPrice && quiz.originalPrice > price && (
                    <span className="text-sm text-ink-faint line-through">{formatMoney(quiz.originalPrice, quiz.currency)}</span>
                  )}
                  <span className="text-[26px] font-bold text-ink">{formatMoney(price, quiz.currency)}</span>
                </div>
                {!owned && <WishlistButton itemType="quiz" itemId={quiz.id} variant="inline" />}
              </div>
            )}

            {!owned && quiz.requiresEntitlement ? (
              <Link
                to="/home"
                className="block rounded-lg border border-brand-500 py-2.5 text-center text-sm font-semibold text-brand-ink hover:bg-brand-500/10"
              >
                Unlock with a package
              </Link>
            ) : !owned ? (
              inCart ? (
                <Link
                  to="/home/cart"
                  className="block rounded-lg border border-brand-500 py-2.5 text-center text-sm font-semibold text-brand-ink hover:bg-brand-500/10"
                >
                  ✓ In Cart · View Cart
                </Link>
              ) : (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    disabled={paying}
                    onClick={() => setShowBuyNow(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
                  >
                    {paying && <Spinner className="h-4 w-4" />}
                    {paying ? 'Opening…' : 'Buy Now'}
                  </button>
                  <button
                    type="button"
                    disabled={addToCartMutation.isPending || paying}
                    onClick={() => addToCartMutation.mutate(quiz.id)}
                    className="w-full rounded-lg border border-brand-500 py-2.5 text-sm font-semibold text-brand-ink hover:bg-brand-500/10 disabled:opacity-60"
                  >
                    {addToCartMutation.isPending ? 'Adding…' : 'Add to Cart'}
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
                className="block rounded-lg bg-brand-500 py-2.5 text-center text-sm font-semibold text-white hover:bg-brand-600"
              >
                Resume
              </Link>
            ) : attempt ? (
              <span className="block rounded-lg bg-surface-sunken px-3 py-2.5 text-center text-sm text-ink-faint">Already attempted</span>
            ) : (
              <Link
                to={`/quizzes/${quiz.id}/take`}
                className="block rounded-lg bg-brand-500 py-2.5 text-center text-sm font-semibold text-white hover:bg-brand-600"
              >
                Start Mock Exam
              </Link>
            )}
          </div>
        </div>

        {/* Same fixed 10 questions, same order, for every visitor every
            time - see getQuizPreviewQuestions's orderBy('order'). */}
        {!owned && previewCount > 0 && (
          <div className="space-y-4">
            <FreePreviewCallout />
            <PreviewQuestions
              itemType="quiz"
              itemId={quiz.id}
              previewQuestionCount={previewCount}
              onBuyNow={() => setShowBuyNow(true)}
            />
          </div>
        )}
      </div>

      <ReviewsSection itemType="quiz" itemId={quiz.id} owned={owned} />

      {showBuyNow && (
        <BuyNowModal
          title={quiz.title}
          price={price}
          originalPrice={quiz.originalPrice ?? null}
          currency={quiz.currency ?? 'INR'}
          paying={paying}
          summaryItem={{ itemType: 'quiz', questionCount: quiz.totalQuestions, accessPeriodDays: quiz.accessPeriodDays }}
          onClose={() => setShowBuyNow(false)}
          onConfirm={(consent, couponCode, useCredit, unlockCode) => {
            checkout({
              buyNowItem: { itemType: 'quiz', itemId: quiz.id },
              items: [{ itemType: 'quiz', itemId: quiz.id, title: quiz.title }],
              consent,
              couponCode,
              useCredit,
              unlockCode,
            });
            setShowBuyNow(false);
          }}
        />
      )}
      {confirmation}
    </div>
  );
}
