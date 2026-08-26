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
import { WishlistButton } from '@/components/common/WishlistButton';
import { ExamFilterBar, DEFAULT_EXAM_FILTERS, matchesExamFilters } from '@/components/common/ExamFilterBar';
import type { PracticeTestDoc } from '@/types/models';

// availableFrom/Until arrive over JSON as a serialized Firestore Timestamp
// ({ _seconds, _nanoseconds }, not { seconds }) — toDate() handles that
// shape; a bare `ts.seconds * 1000` silently produced an Invalid Date here.
function formatDate(ts: unknown): string {
  return toDate(ts).toLocaleDateString();
}

// jsPDF (certificate.ts) is a meaningful chunk of code that only a fraction
// of visitors ever trigger — dynamically imported here rather than a static
// top-level import, same pattern as PerformancePage.tsx's exportToExcel, so
// it lands in its own lazy-loaded chunk instead of bloating the one bundle
// this app ships (there's no route-level code splitting here at all).
async function downloadCertificate(...args: Parameters<typeof import('@/utils/certificate').downloadCertificate>) {
  const mod = await import('@/utils/certificate');
  return mod.downloadCertificate(...args);
}

export function PracticeTestsPage() {
  const uid = useAuthStore((s) => s.firebaseUser?.uid);
  const profile = useAuthStore((s) => s.profile);
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const { checkout, paying, confirmation } = useCheckout();
  const [buyNowTest, setBuyNowTest] = useState<(PracticeTestDoc & { id: string }) | null>(null);
  const [filters, setFilters] = useState(DEFAULT_EXAM_FILTERS);

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

  const filteredAvailable = available.filter((test) => {
    const answered = progressByTestId.get(test.id)?.answeredQuestionIds.length ?? 0;
    const status = answered >= test.totalQuestions ? 'completed' : answered > 0 ? 'in_progress' : 'not_started';
    return matchesExamFilters(
      filters,
      { title: test.title, category: test.category ?? 'Other', skillLevel: test.skillLevel ?? 'Foundation', price: test.price ?? 0 },
      status
    );
  });

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
      <h1 className="mb-1 text-2xl font-bold text-ink">Practice Exams</h1>
      <p className="mb-6 text-sm text-ink-faint">Resume where you left off. Each session pulls only unanswered questions.</p>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Available" value={available.length} color="text-brand-ink" />
        <StatCard label="Started" value={startedCount} color="text-[#d87f1d]" />
        <StatCard label="Completed" value={completedCount} color="text-emerald-700 dark:text-emerald-400" />
      </div>

      <ExamFilterBar filters={filters} onChange={setFilters} />

      {available.length === 0 ? (
        <p className="rounded-xl border border-dashed border-surface-border p-6 text-center text-sm text-ink-faint">
          No practice tests are available right now.
        </p>
      ) : filteredAvailable.length === 0 ? (
        <p className="rounded-xl border border-dashed border-surface-border p-6 text-center text-sm text-ink-faint">
          Nothing matches those filters. Try clearing the search or picking "All".
        </p>
      ) : (
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredAvailable.map((test) => {
            const answered = progressByTestId.get(test.id)?.answeredQuestionIds.length ?? 0;
            const done = answered >= test.totalQuestions;
            const price = test.price ?? 0;
            const owned = price === 0 || purchasedSet.has(`practiceTest_${test.id}`);
            const inCart = inCartSet.has(`practiceTest_${test.id}`);

            return (
              <div key={test.id} className="overflow-hidden rounded-xl border border-surface-border bg-surface-raised">
                <Link to={`/home/practice-tests/${test.id}`}>
                  <CourseCoverImage id={test.id} title={test.title} className="h-20 w-full" />
                </Link>
                {/* Heart lives on the plain card body (variant="inline"), not
                    over the cover banner — see StudentHomePage.tsx's card. */}
                <div className="relative p-3.5">
                  {!owned && <WishlistButton itemType="practiceTest" itemId={test.id} variant="inline" className="absolute right-2.5 top-2.5" />}
                <div className="mb-0.5 flex flex-wrap items-center gap-1.5 pr-8 text-xs uppercase tracking-wide text-ink-faint">
                  <span>{test.category ?? 'Other'}</span>
                  <span>·</span>
                  <span>{test.skillLevel ?? 'Foundation'}</span>
                </div>
                <Link to={`/home/practice-tests/${test.id}`} className="hover:text-brand-ink">
                  <h3 className="mb-0.5 line-clamp-2 pr-8 text-sm font-bold leading-snug text-ink">{test.title}</h3>
                </Link>
                {(test.ratingCount ?? 0) > 0 && (
                  <div className="mb-1 flex items-center gap-1.5">
                    <StarRating value={test.ratingAvg ?? 0} size="sm" />
                    <span className="text-xs text-ink-faint">
                      {(test.ratingAvg ?? 0).toFixed(1)} ({test.ratingCount})
                    </span>
                  </div>
                )}
                <div className="mb-2 text-xs text-ink-faint">
                  {answered} / {test.totalQuestions} answered ·{' '}
                  {test.durationPerSessionMinutes ? `${test.durationPerSessionMinutes} min/session` : 'you choose session length'}
                </div>

                {price > 0 && (
                  <div className="mb-2 flex items-center gap-2">
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
                      className="block rounded-lg border border-[#1D4ED8]/50 py-1.5 text-center text-sm font-medium text-[#1D4ED8]"
                    >
                      ✓ In Cart · View Cart
                    </Link>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={addToCartMutation.isPending || paying}
                        onClick={() => addToCartMutation.mutate(test.id)}
                        className="flex-1 rounded-lg border border-surface-border py-1.5 text-sm font-medium text-ink-muted hover:opacity-80 disabled:opacity-60"
                      >
                        Add to Cart
                      </button>
                      <button
                        type="button"
                        disabled={paying}
                        onClick={() => setBuyNowTest(test)}
                        className="flex-1 rounded-lg bg-[#1D4ED8] py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
                      >
                        {paying ? 'Opening…' : 'Buy Now'}
                      </button>
                    </div>
                  )
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex gap-2">
                      {!done && (
                        <Link
                          to={`/practice-tests/${test.id}/take`}
                          className="flex-1 rounded-lg bg-[#1D4ED8] py-1.5 text-center text-sm font-medium text-surface"
                        >
                          {answered > 0 ? 'Resume' : 'Start'}
                        </Link>
                      )}
                      {answered > 0 && (
                        <Link
                          to={`/practice-tests/${test.id}/take?reattempt=1`}
                          className="flex-1 rounded-lg border border-surface-border py-1.5 text-center text-sm text-ink-muted"
                        >
                          Reattempt
                        </Link>
                      )}
                    </div>
                    {/* Surfaced right here, not just buried on the detail
                        page, so a learner can set (or jump back into) their
                        study goal without an extra click through. */}
                    {!done && test.studyPlannerEnabled !== false && (
                      <Link
                        to={`/home/practice-tests/${test.id}/study-plan`}
                        className="rounded-lg border border-dashed border-surface-border py-1.5 text-center text-sm text-ink-muted hover:border-brand-400"
                      >
                        🎯 Set Your Study Goal
                      </Link>
                    )}
                    {done && (
                      <button
                        type="button"
                        onClick={() =>
                          downloadCertificate({
                            studentName: profile?.name ?? 'Student',
                            itemTitle: test.title,
                            itemType: 'practiceTest',
                            category: test.category ?? 'Other',
                            scoreLabel: '',
                            dateLabel: new Date().toLocaleDateString(),
                            certificateCode: test.id.slice(0, 8).toUpperCase(),
                          })
                        }
                        className="rounded-lg border border-brand-400 py-1.5 text-sm font-medium text-brand-ink hover:bg-brand-500/10"
                      >
                        🎓 Download Certificate
                      </button>
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
                  {test.totalQuestions} questions ·{' '}
                  {test.durationPerSessionMinutes ? `${test.durationPerSessionMinutes} min/session` : 'you choose session length'}
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
