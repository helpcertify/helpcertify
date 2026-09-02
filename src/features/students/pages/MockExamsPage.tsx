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
import { activePurchaseKeys } from '../lib/purchaseAccess';
import { BuyNowModal } from '@/components/common/BuyNowModal';
import { Spinner } from '@/components/common/Spinner';
import { ProductCardShell } from '@/components/common/ProductCardShell';
import { ExamFilterBar, DEFAULT_EXAM_FILTERS, matchesExamFilters } from '@/components/common/ExamFilterBar';
import type { QuizDoc } from '@/types/models';

// Full-length, timed exam simulations - this is the content that used to
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
  const purchasedSet = activePurchaseKeys(purchases?.purchases);
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
      {/* Fixed-width cards (flex-wrap), same w-60/sm:w-72 size as every
          other product card in the app, on request. */}
      <div className="flex flex-wrap gap-4">
        {filtered.map((quiz) => {
          const attempt = attemptByQuizId.get(quiz.id);
          const notYetOpen = quiz.scheduledStart && quiz.scheduledStart.toMillis() > Date.now();
          const price = quiz.price ?? 0;
          const owned = purchasedSet.has(`quiz_${quiz.id}`) || (price === 0 && !quiz.requiresEntitlement);
          const entitlementLocked = !!quiz.requiresEntitlement && !purchasedSet.has(`quiz_${quiz.id}`);
          const inCart = inCartSet.has(`quiz_${quiz.id}`);
          const href = `/home/quizzes/${quiz.id}`;

          const footer = entitlementLocked ? (
            <Link
              to="/home"
              className="block w-full rounded-lg border border-[#155EEF] py-1.5 text-center text-sm font-semibold text-[#155EEF] hover:bg-[#F8FAFF]"
            >
              Unlock with a package
            </Link>
          ) : !owned ? (
            inCart ? (
              <Link to="/home/cart" className="block rounded-lg border border-[#155EEF]/50 py-1.5 text-center text-sm font-semibold text-[#155EEF]">
                ✓ In Cart · View Cart
              </Link>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={addToCartMutation.isPending || paying}
                  onClick={() => addToCartMutation.mutate(quiz.id)}
                  className="flex-1 rounded-lg border border-[#CBD5E1] bg-white py-1.5 text-sm font-semibold text-[#334155] transition-colors hover:border-[#155EEF] hover:bg-[#F8FAFF] hover:text-[#155EEF] disabled:opacity-60"
                >
                  Add to Cart
                </button>
                <button
                  type="button"
                  disabled={paying}
                  onClick={() => setBuyNowQuiz(quiz)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#155EEF] py-1.5 text-sm font-semibold text-white transition-colors hover:bg-[#004EEB] disabled:opacity-60"
                >
                  {paying && <Spinner className="h-4 w-4" />}
                  {paying ? 'Opening…' : 'Buy Now'}
                </button>
              </div>
            )
          ) : notYetOpen ? (
            <span className="block text-center text-sm text-[#64748B]">Opens {new Date(quiz.scheduledStart!.toMillis()).toLocaleString()}</span>
          ) : attempt?.status === 'in_progress' ? (
            <Link to={`/quizzes/${quiz.id}/take`} className="block rounded-lg bg-[#155EEF] py-1.5 text-center text-sm font-semibold text-white transition-colors hover:bg-[#004EEB]">
              Resume
            </Link>
          ) : attempt ? (
            <span className="block rounded-lg bg-[#F1F5F9] px-3 py-1.5 text-center text-sm text-[#64748B]">Already attempted</span>
          ) : (
            <Link to={`/quizzes/${quiz.id}/take`} className="block rounded-lg bg-[#155EEF] py-1.5 text-center text-sm font-semibold text-white transition-colors hover:bg-[#004EEB]">
              Start Mock Exam
            </Link>
          );

          return (
            <ProductCardShell
              key={quiz.id}
              id={quiz.id}
              itemType="quiz"
              title={quiz.title}
              category={quiz.category ?? 'Other'}
              skillLevel={quiz.skillLevel ?? 'Foundation'}
              ratingAvg={quiz.ratingAvg ?? 0}
              ratingCount={quiz.ratingCount ?? 0}
              price={price}
              originalPrice={quiz.originalPrice ?? null}
              currency={quiz.currency ?? 'INR'}
              detailHref={href}
              footer={footer}
            />
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
          summaryItem={{ itemType: 'quiz', questionCount: buyNowQuiz.totalQuestions, accessPeriodDays: buyNowQuiz.accessPeriodDays }}
          onClose={() => setBuyNowQuiz(null)}
          onConfirm={(consent, couponCode, useCredit) => {
            checkout({
              buyNowItem: { itemType: 'quiz', itemId: buyNowQuiz.id },
              items: [{ itemType: 'quiz', itemId: buyNowQuiz.id, title: buyNowQuiz.title }],
              consent,
              couponCode,
              useCredit,
            });
            setBuyNowQuiz(null);
          }}
        />
      )}
      {confirmation}
    </div>
  );
}
