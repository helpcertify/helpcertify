import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { listPracticeTestsBucketed } from '../api/studentContentApi';
import { cartApi } from '../api/cartApi';
import { useCheckout } from '../hooks/useCheckout';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { useUiStore } from '@/store/useUiStore';
import { toDate } from '@/utils/formatDate';
import { formatMoney } from '@/utils/currency';
import { BuyNowModal } from '@/components/common/BuyNowModal';
import { CourseCoverImage } from '@/components/common/CourseCoverImage';
import { StarRating } from '@/components/common/StarRating';
import type { PracticeTestDoc } from '@/types/models';

// availableFrom/Until arrive over JSON as a serialized Firestore Timestamp
// ({ _seconds, _nanoseconds }, not { seconds }) — toDate() handles that
// shape; a bare `ts.seconds * 1000` silently produced an Invalid Date here.
function formatDate(ts: unknown): string {
  return toDate(ts).toLocaleDateString();
}

export function PracticeTestsPage() {
  const uid = useAuthStore((s) => s.firebaseUser?.uid);
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const { checkout, paying, confirmation } = useCheckout();
  const [buyNowTest, setBuyNowTest] = useState<(PracticeTestDoc & { id: string }) | null>(null);

  const { data: buckets } = useQuery({ queryKey: ['student', 'practiceTests'], queryFn: listPracticeTestsBucketed });
  const { data: progressDocs } = useQuery({
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
  const { data: purchases } = useQuery({ queryKey: ['student', 'purchases'], queryFn: cartApi.listMyPurchases });
  const { data: cart } = useQuery({ queryKey: ['student', 'cart'], queryFn: cartApi.getCart });

  const progressByTestId = new Map((progressDocs ?? []).map((p) => [p.testId, p]));
  const purchasedSet = new Set((purchases?.purchases ?? []).map((p) => `${p.itemType}_${p.itemId}`));
  const inCartSet = new Set((cart?.items ?? []).map((i) => `${i.itemType}_${i.itemId}`));

  // A purchase is permanent access — the admin's availability window can't
  // take away something a student already paid for (the backend enforces
  // this too, see api/practice-session.ts). A purchased-but-window-expired
  // test is treated as available here instead of landing in the locked
  // Expired section below.
  const rawExpired = buckets?.expired ?? [];
  const purchasedExpired = rawExpired.filter((t) => purchasedSet.has(`practiceTest_${t.id}`));
  const trulyExpired = rawExpired.filter((t) => !purchasedSet.has(`practiceTest_${t.id}`));
  const available = [...(buckets?.available ?? []), ...purchasedExpired];
  const startedCount = available.filter((t) => (progressByTestId.get(t.id)?.answeredQuestionIds.length ?? 0) > 0).length;
  const completedCount = available.filter(
    (t) => (progressByTestId.get(t.id)?.answeredQuestionIds.length ?? 0) >= t.totalQuestions
  ).length;

  const addToCartMutation = useMutation({
    mutationFn: (testId: string) => cartApi.addItem('practiceTest', testId),
    onSuccess: (data) => {
      queryClient.setQueryData(['student', 'cart'], data);
      pushToast('Added to cart', 'success');
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : 'Could not add to cart', 'error'),
  });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-ink">Practice Tests</h1>
      <p className="mb-6 text-sm text-ink-faint">Resume where you left off. Each session pulls only unanswered questions.</p>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Available" value={available.length} color="text-brand-ink" />
        <StatCard label="Started" value={startedCount} color="text-amber-400" />
        <StatCard label="Completed" value={completedCount} color="text-emerald-400" />
      </div>

      {available.length === 0 ? (
        <p className="rounded-xl border border-dashed border-surface-border p-6 text-center text-sm text-ink-faint">
          No practice tests are available right now.
        </p>
      ) : (
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {available.map((test) => {
            const answered = progressByTestId.get(test.id)?.answeredQuestionIds.length ?? 0;
            const done = answered >= test.totalQuestions;
            const price = test.price ?? 0;
            const owned = price === 0 || purchasedSet.has(`practiceTest_${test.id}`);
            const inCart = inCartSet.has(`practiceTest_${test.id}`);

            return (
              <div key={test.id} className="overflow-hidden rounded-xl border border-surface-border bg-surface-raised">
                <Link to={`/home/practice-tests/${test.id}`}>
                  <CourseCoverImage id={test.id} title={test.title} className="h-32 w-full" />
                </Link>
                <div className="p-5">
                <div className="mb-1 text-xs uppercase tracking-wide text-ink-faint">{test.category ?? 'Other'}</div>
                <Link to={`/home/practice-tests/${test.id}`} className="hover:text-brand-ink">
                  <h3 className="mb-1 font-bold text-ink">{test.title}</h3>
                </Link>
                {(test.ratingCount ?? 0) > 0 && (
                  <div className="mb-2 flex items-center gap-1.5">
                    <StarRating value={test.ratingAvg ?? 0} size="sm" />
                    <span className="text-xs text-ink-faint">
                      {(test.ratingAvg ?? 0).toFixed(1)} ({test.ratingCount})
                    </span>
                  </div>
                )}
                <div className="mb-3 space-y-0.5 text-sm text-ink-faint">
                  <div>{answered} / {test.totalQuestions} answered</div>
                  <div>{test.durationPerSessionMinutes} min/session</div>
                </div>

                {price > 0 && (
                  <div className="mb-3 flex items-center gap-2">
                    {test.originalPrice && test.originalPrice > price && (
                      <span className="text-xs text-ink-faint line-through">{formatMoney(test.originalPrice, test.currency)}</span>
                    )}
                    <span className="font-semibold text-ink">{formatMoney(price, test.currency)}</span>
                  </div>
                )}

                {!owned ? (
                  inCart ? (
                    <Link
                      to="/home/cart"
                      className="block rounded-lg border border-blue-500/50 py-2 text-center text-sm font-medium text-blue-300"
                    >
                      ✓ In Cart · View Cart
                    </Link>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={addToCartMutation.isPending || paying}
                        onClick={() => addToCartMutation.mutate(test.id)}
                        className="flex-1 rounded-lg border border-surface-border py-2 text-sm font-medium text-ink-muted hover:border-blue-400 disabled:opacity-60"
                      >
                        Add to Cart
                      </button>
                      <button
                        type="button"
                        disabled={paying}
                        onClick={() => setBuyNowTest(test)}
                        className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
                      >
                        {paying ? 'Opening…' : 'Buy Now'}
                      </button>
                    </div>
                  )
                ) : (
                  <div className="flex gap-2">
                    {!done && (
                      <Link
                        to={`/practice-tests/${test.id}/take`}
                        className="flex-1 rounded-lg bg-brand-gradient py-2 text-center text-sm font-medium text-surface"
                      >
                        {answered > 0 ? 'Resume' : 'Start'}
                      </Link>
                    )}
                    {answered > 0 && (
                      <Link
                        to={`/practice-tests/${test.id}/take?reattempt=1`}
                        className="flex-1 rounded-lg border border-surface-border py-2 text-center text-sm text-ink-muted"
                      >
                        Reattempt
                      </Link>
                    )}
                  </div>
                )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {((buckets?.upcoming.length ?? 0) > 0 || trulyExpired.length > 0) && (
        <>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-faint">Upcoming / Expired</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...(buckets?.upcoming ?? []), ...trulyExpired].map((test) => (
              <div key={test.id} className="rounded-xl border border-surface-border bg-black/20 p-5 opacity-70">
                <div className="mb-2 flex items-start justify-between">
                  <h3 className="font-bold text-ink">{test.title}</h3>
                  <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-ink-faint">
                    🔒 {toDate(test.availableUntil).getTime() < Date.now() ? 'Expired' : 'Upcoming'}
                  </span>
                </div>
                <div className="text-sm text-ink-faint">
                  {test.totalQuestions} questions · {test.durationPerSessionMinutes} min/session
                  <br />
                  {formatDate(test.availableFrom)} → {formatDate(test.availableUntil)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {buyNowTest && (
        <BuyNowModal
          title={buyNowTest.title}
          price={buyNowTest.price ?? 0}
          originalPrice={buyNowTest.originalPrice ?? null}
          currency={buyNowTest.currency ?? 'INR'}
          paying={paying}
          onClose={() => setBuyNowTest(null)}
          onConfirm={(couponCode) => {
            checkout({
              buyNowItem: { itemType: 'practiceTest', itemId: buyNowTest.id },
              items: [{ itemType: 'practiceTest', itemId: buyNowTest.id, title: buyNowTest.title }],
              couponCode,
            });
            setBuyNowTest(null);
          }}
        />
      )}
      {confirmation}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-raised p-5">
      <div className="text-xs uppercase tracking-wide text-ink-faint">{label}</div>
      <div className={`mt-2 text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
