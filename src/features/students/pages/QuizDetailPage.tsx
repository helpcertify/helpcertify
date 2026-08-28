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
import { CourseIcon } from '@/components/common/CourseIcon';
import { StarRating } from '@/components/common/StarRating';
import { ReviewsSection } from '@/components/common/ReviewsSection';
import { PreviewQuestions } from '@/components/common/PreviewQuestions';
import { WishlistButton } from '@/components/common/WishlistButton';

// A fixed 10-question free sample regardless of the admin's own
// previewQuestionCount setting — same convention as PracticeTestDetailPage,
// on request, so every visitor sees the same "try 10 questions" experience.
const SAMPLE_PREVIEW_COUNT = 10;

// Master HelpCertify design-system layout — same visual language as
// PracticeTestDetailPage (full-width header card, two-column Course
// Access + Free Preview, full-width Reviews). Purely a visual pass; the
// underlying data/mutations are unchanged from before this restyle.
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
    // Fills the width StudentShell's sidebar leaves available (up to a
    // 1440px cap) instead of centering a much-narrower fixed column inside
    // it — same fix as PracticeTestDetailPage, same underlying cause.
    <div className="mx-auto w-[calc(100%-48px)] max-w-[1440px]">
      <Link to="/home/mock-exams" className="mb-4 inline-block text-sm text-brand-ink hover:underline">
        ← Back to Mock Exams
      </Link>

      {/* Header — full width, badges/title/rating/stats on the left, a
          decorative certification mark on the right. */}
      <div className="mb-6 flex flex-col justify-between gap-6 rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-[0_2px_8px_rgba(15,23,42,0.05)] dark:bg-surface-raised sm:flex-row sm:items-center">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#64748B]">
            <span>{quiz.category ?? 'Other'}</span>
            <span>·</span>
            <span>{quiz.skillLevel ?? 'Foundation'}</span>
          </div>
          <h1 className="mb-2 text-[28px] font-bold leading-tight text-[#0F172A]">{quiz.title}</h1>

          {(quiz.ratingCount ?? 0) > 0 && (
            <div className="mb-3 flex items-center gap-2">
              <StarRating value={quiz.ratingAvg ?? 0} size="sm" />
              <span className="text-sm text-[#64748B]">
                {(quiz.ratingAvg ?? 0).toFixed(1)} ({quiz.ratingCount} review{quiz.ratingCount === 1 ? '' : 's'})
              </span>
            </div>
          )}

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#475569]">
            <span>▣ {quiz.totalQuestions} Questions</span>
            <span>◷ {quiz.durationMinutes} min</span>
          </div>

          {quiz.description && (
            <p className="mt-4 max-w-[760px] whitespace-pre-line text-sm leading-relaxed text-[#1E293B]">{quiz.description}</p>
          )}
        </div>

        <div className="hidden shrink-0 items-center justify-center rounded-xl bg-[#EFF6FF] p-6 sm:flex">
          <div className="scale-[1.8]">
            <CourseIcon id={quiz.id} title={quiz.title} itemType="quiz" />
          </div>
        </div>
      </div>

      {/* Course Access + Free Preview when not owned; Course Access alone
          (centered, capped width) when owned — there's no practice-setup/
          study-plan equivalent for a timed Mock Exam. */}
      <div className={`mb-6 grid grid-cols-1 gap-6 ${!owned && previewCount > 0 ? 'lg:grid-cols-[0.7fr_1.3fr] lg:items-start' : ''}`}>
        <div className={!owned && previewCount > 0 ? '' : 'max-w-sm'}>
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-[0_2px_8px_rgba(15,23,42,0.05)] dark:bg-surface-raised">
            <h2 className="mb-4 text-[15px] font-bold uppercase tracking-wide text-[#155EEF]">Course Access</h2>

            {price > 0 && (
              <div className="mb-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {quiz.originalPrice && quiz.originalPrice > price && (
                    <span className="text-sm text-[#94A3B8] line-through">{formatMoney(quiz.originalPrice, quiz.currency)}</span>
                  )}
                  <span className="text-[26px] font-bold text-[#0F172A]">{formatMoney(price, quiz.currency)}</span>
                </div>
                {!owned && <WishlistButton itemType="quiz" itemId={quiz.id} variant="inline" />}
              </div>
            )}

            {!owned ? (
              inCart ? (
                <Link
                  to="/home/cart"
                  className="block rounded-lg border border-[#155EEF] py-2.5 text-center text-sm font-semibold text-[#155EEF] hover:bg-[#EFF6FF]"
                >
                  ✓ In Cart · View Cart
                </Link>
              ) : (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    disabled={paying}
                    onClick={() => setShowBuyNow(true)}
                    className="w-full rounded-lg bg-[#155EEF] py-2.5 text-sm font-semibold text-white hover:bg-[#004EEB] disabled:opacity-60"
                  >
                    {paying ? 'Opening…' : 'Buy Now'}
                  </button>
                  <button
                    type="button"
                    disabled={addToCartMutation.isPending || paying}
                    onClick={() => addToCartMutation.mutate(quiz.id)}
                    className="w-full rounded-lg border border-[#155EEF] py-2.5 text-sm font-semibold text-[#155EEF] hover:bg-[#EFF6FF] disabled:opacity-60"
                  >
                    {addToCartMutation.isPending ? 'Adding…' : 'Add to Cart'}
                  </button>
                </div>
              )
            ) : notYetOpen ? (
              <span className="block text-center text-sm text-[#64748B]">
                Opens {new Date(quiz.scheduledStart!.toMillis()).toLocaleString()}
              </span>
            ) : attempt?.status === 'in_progress' ? (
              <Link
                to={`/quizzes/${quiz.id}/take`}
                className="block rounded-lg bg-[#155EEF] py-2.5 text-center text-sm font-semibold text-white hover:bg-[#004EEB]"
              >
                Resume
              </Link>
            ) : attempt ? (
              <span className="block rounded-lg bg-[#F1F5F9] px-3 py-2.5 text-center text-sm text-[#64748B]">Already attempted</span>
            ) : (
              <Link
                to={`/quizzes/${quiz.id}/take`}
                className="block rounded-lg bg-[#155EEF] py-2.5 text-center text-sm font-semibold text-white hover:bg-[#004EEB]"
              >
                Start Mock Exam
              </Link>
            )}
          </div>
        </div>

        {/* Same fixed 10 questions, same order, for every visitor every
            time — see getQuizPreviewQuestions's orderBy('order'). */}
        {!owned && previewCount > 0 && (
          <PreviewQuestions
            itemType="quiz"
            itemId={quiz.id}
            previewQuestionCount={previewCount}
            onBuyNow={() => setShowBuyNow(true)}
          />
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
          onClose={() => setShowBuyNow(false)}
          onConfirm={(couponCode, useCredit) => {
            checkout({
              buyNowItem: { itemType: 'quiz', itemId: quiz.id },
              items: [{ itemType: 'quiz', itemId: quiz.id, title: quiz.title }],
              couponCode,
              useCredit,
            });
            setShowBuyNow(false);
          }}
        />
      )}
      {confirmation}
    </div>
  );
}
