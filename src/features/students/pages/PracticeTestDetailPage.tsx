import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getPracticeTestById } from '../api/studentContentApi';
import { cartApi } from '../api/cartApi';
import { useCheckout } from '../hooks/useCheckout';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { useUiStore } from '@/store/useUiStore';
import { toDate } from '@/utils/formatDate';
import { formatMoney } from '@/utils/currency';
import { BuyNowModal } from '@/components/common/BuyNowModal';
import { CourseCoverImage } from '@/components/common/CourseCoverImage';
import { StarRating } from '@/components/common/StarRating';
import { ReviewsSection } from '@/components/common/ReviewsSection';
import { RelatedItems } from '@/components/common/RelatedItems';
import { PreviewQuestions } from '@/components/common/PreviewQuestions';
import { WishlistButton } from '@/components/common/WishlistButton';

function formatDate(ts: unknown): string {
  return toDate(ts).toLocaleDateString();
}

// The "course landing page" a student sees before (or after) buying a
// practice test, reached by clicking a card rather than acting on its
// buttons directly. Mirrors PracticeTestsPage's per-card bucket logic
// (available / upcoming / expired, with a purchase permanently overriding
// an expired window) laid out as a full page with room for the description.
export function PracticeTestDetailPage() {
  const { testId } = useParams<{ testId: string }>();
  const uid = useAuthStore((s) => s.firebaseUser?.uid);
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const { checkout, paying, confirmation } = useCheckout();
  const [showBuyNow, setShowBuyNow] = useState(false);

  const { data: test, isLoading } = useQuery({
    queryKey: ['student', 'practiceTest', testId],
    queryFn: () => getPracticeTestById(testId!),
    enabled: !!testId,
  });
  const { data: progress } = useQuery({
    queryKey: ['student', 'myPracticeProgress', uid, testId],
    queryFn: async () => {
      const snap = await getDocs(
        query(collection(db, 'practiceProgress'), where('userId', '==', uid), where('testId', '==', testId))
      );
      if (snap.empty) return null;
      const data = snap.docs[0].data();
      return { answeredQuestionIds: (data.answeredQuestionIds as string[]) ?? [] };
    },
    enabled: !!uid && !!testId,
  });
  const { data: purchases } = useQuery({ queryKey: ['student', 'purchases'], queryFn: cartApi.listMyPurchases });
  const { data: cart } = useQuery({ queryKey: ['student', 'cart'], queryFn: cartApi.getCart });

  const addToCartMutation = useMutation({
    mutationFn: (id: string) => cartApi.addItem('practiceTest', id),
    onSuccess: (data) => {
      queryClient.setQueryData(['student', 'cart'], data);
      pushToast('Added to cart', 'success');
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : 'Could not add to cart', 'error'),
  });

  if (isLoading) {
    return <p className="text-sm text-ink-faint">Loading…</p>;
  }
  if (!test) {
    return (
      <div className="rounded-xl border border-dashed border-surface-border p-8 text-center">
        <p className="mb-4 text-ink-faint">This practice test doesn't exist or is no longer available.</p>
        <Link
          to="/home/practice-tests"
          className="rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted hover:border-brand-400"
        >
          Back to Practice Exams
        </Link>
      </div>
    );
  }

  const price = test.price ?? 0;
  const purchasedSet = new Set((purchases?.purchases ?? []).map((p) => `${p.itemType}_${p.itemId}`));
  const inCartSet = new Set((cart?.items ?? []).map((i) => `${i.itemType}_${i.itemId}`));
  const purchased = purchasedSet.has(`practiceTest_${test.id}`);
  const owned = price === 0 || purchased;
  const inCart = inCartSet.has(`practiceTest_${test.id}`);

  const now = Date.now();
  const from = test.availableFrom?.toMillis() ?? 0;
  const until = test.availableUntil?.toMillis() ?? Infinity;
  const rawState: 'available' | 'upcoming' | 'expired' = now < from ? 'upcoming' : now > until ? 'expired' : 'available';
  // A purchase is permanent access, same override as PracticeTestsPage — the
  // admin's availability window can't take away something already paid for.
  // Keyed to an actual purchase record specifically, not the broader `owned`
  // (a free-but-expired test has no purchase to justify overriding the
  // window, and the server enforces the window for it same as anyone else).
  const state = rawState === 'expired' && purchased ? 'available' : rawState;

  const answered = progress?.answeredQuestionIds.length ?? 0;
  const done = answered >= test.totalQuestions;

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/home/practice-tests" className="mb-4 inline-block text-sm text-ink-faint hover:text-brand-ink">
        ← Back to Practice Exams
      </Link>

      <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-raised">
        <CourseCoverImage id={test.id} title={test.title} className="h-56 w-full" />
        <div className="p-6">
          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs uppercase tracking-wide text-ink-faint">
            <span>{test.category ?? 'Other'}</span>
            <span>·</span>
            <span>{test.skillLevel ?? 'Foundation'}</span>
          </div>
          <h1 className="mb-2 text-2xl font-bold text-ink">{test.title}</h1>

          {(test.ratingCount ?? 0) > 0 && (
            <div className="mb-3 flex items-center gap-2">
              <StarRating value={test.ratingAvg ?? 0} size="sm" />
              <span className="text-sm text-ink-faint">
                {(test.ratingAvg ?? 0).toFixed(1)} ({test.ratingCount} review{test.ratingCount === 1 ? '' : 's'})
              </span>
            </div>
          )}

          <div className="mb-5 flex flex-wrap gap-4 text-sm text-ink-faint">
            <span>📄 {test.totalQuestions} questions</span>
            <span>⏱ {test.durationPerSessionMinutes} min/session</span>
          </div>

          {test.description && (
            <div className="mb-6">
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-faint">About this practice test</h2>
              <p className="whitespace-pre-line text-sm text-ink-muted">{test.description}</p>
            </div>
          )}

          {!owned && <PreviewQuestions itemType="practiceTest" itemId={test.id} />}

          <div className="rounded-xl border border-surface-border bg-surface p-5">
            {price > 0 && (
              <div className="mb-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {test.originalPrice && test.originalPrice > price && (
                    <span className="text-sm text-ink-faint line-through">{formatMoney(test.originalPrice, test.currency)}</span>
                  )}
                  <span className="text-xl font-bold text-ink">{formatMoney(price, test.currency)}</span>
                </div>
                {!owned && <WishlistButton itemType="practiceTest" itemId={test.id} variant="inline" />}
              </div>
            )}

            {state !== 'available' ? (
              <div className="rounded-lg bg-neutral-800 px-3 py-2.5 text-center text-sm text-ink-faint">
                🔒 {state === 'expired' ? 'Expired' : 'Upcoming'}. Available {formatDate(test.availableFrom)} →{' '}
                {formatDate(test.availableUntil)}
              </div>
            ) : !owned ? (
              inCart ? (
                <Link
                  to="/home/cart"
                  className="block rounded-lg border border-[#1D4ED8]/50 py-2.5 text-center text-sm font-medium text-[#1D4ED8]"
                >
                  ✓ In Cart · View Cart
                </Link>
              ) : (
                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled={addToCartMutation.isPending || paying}
                    onClick={() => addToCartMutation.mutate(test.id)}
                    className="flex-1 rounded-lg border border-surface-border py-2.5 text-sm font-medium text-ink-muted hover:opacity-80 disabled:opacity-60"
                  >
                    Add to Cart
                  </button>
                  <button
                    type="button"
                    disabled={paying}
                    onClick={() => setShowBuyNow(true)}
                    className="flex-1 rounded-lg bg-[#1D4ED8] py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
                  >
                    {paying ? 'Opening…' : 'Buy Now'}
                  </button>
                </div>
              )
            ) : (
              <div className="flex gap-3">
                {!done && (
                  <Link
                    to={`/practice-tests/${test.id}/take`}
                    className="flex-1 rounded-lg bg-[#1D4ED8] py-2.5 text-center text-sm font-medium text-surface"
                  >
                    {answered > 0 ? 'Resume' : 'Start'}
                  </Link>
                )}
                {answered > 0 && (
                  <Link
                    to={`/practice-tests/${test.id}/take?reattempt=1`}
                    className="flex-1 rounded-lg border border-surface-border py-2.5 text-center text-sm text-ink-muted"
                  >
                    Reattempt
                  </Link>
                )}
              </div>
            )}
          </div>

          <RelatedItems category={test.category ?? 'Other'} excludeItemType="practiceTest" excludeItemId={test.id} />
          <ReviewsSection itemType="practiceTest" itemId={test.id} owned={owned} />
        </div>
      </div>

      {showBuyNow && (
        <BuyNowModal
          title={test.title}
          price={price}
          originalPrice={test.originalPrice ?? null}
          currency={test.currency ?? 'INR'}
          paying={paying}
          onClose={() => setShowBuyNow(false)}
          onConfirm={(couponCode) => {
            checkout({
              buyNowItem: { itemType: 'practiceTest', itemId: test.id },
              items: [{ itemType: 'practiceTest', itemId: test.id, title: test.title }],
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
