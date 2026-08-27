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
import { BuyNowModal } from '@/components/common/BuyNowModal';
import { ProductCardShell } from '@/components/common/ProductCardShell';
import { ExamFilterBar, DEFAULT_EXAM_FILTERS, matchesExamFilters } from '@/components/common/ExamFilterBar';
import { RelatedItems } from '@/components/common/RelatedItems';
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
        // Fixed-width cards (flex-wrap, not a CSS grid that stretches each
        // cell) so every card is the exact same size as the Home
        // dashboard's Recommended for You cards, on request — not just
        // visually similar but literally the same w-60/sm:w-72.
        <div className="mb-8 flex flex-wrap gap-4">
          {filteredAvailable.map((test) => (
            <PracticeTestCard
              key={test.id}
              test={test}
              answered={progressByTestId.get(test.id)?.answeredQuestionIds.length ?? 0}
              owned={(test.price ?? 0) === 0 || purchasedSet.has(`practiceTest_${test.id}`)}
              inCart={inCartSet.has(`practiceTest_${test.id}`)}
              addingToCart={addToCartMutation.isPending}
              paying={paying}
              onAddToCart={() => addToCartMutation.mutate(test.id)}
              onBuyNow={() => setBuyNowTest(test)}
              onDownloadCertificate={() =>
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
            />
          ))}
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

      {/* Full-width, at the very end of the page — a general "Students
          also bought" assortment since there's no single item here to
          relate to (unlike the detail page, which scopes this to the
          current item's own category). */}
      <RelatedItems />

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

interface PracticeTestCardProps {
  test: PracticeTestDoc & { id: string };
  answered: number;
  owned: boolean;
  inCart: boolean;
  addingToCart: boolean;
  paying: boolean;
  onAddToCart: () => void;
  onBuyNow: () => void;
  onDownloadCertificate: () => void;
}

function PracticeTestCard({
  test,
  answered,
  owned,
  inCart,
  addingToCart,
  paying,
  onAddToCart,
  onBuyNow,
  onDownloadCertificate,
}: PracticeTestCardProps) {
  const done = answered >= test.totalQuestions;
  const price = test.price ?? 0;
  const detailHref = `/home/practice-tests/${test.id}`;

  const primaryOwnedAction = done ? (
    <button
      type="button"
      onClick={onDownloadCertificate}
      className="w-full rounded-lg border border-[#155EEF] py-1.5 text-sm font-semibold text-[#155EEF] hover:bg-[#F8FAFF]"
    >
      🎓 Download Certificate
    </button>
  ) : test.studyPlannerEnabled !== false ? (
    <Link
      to={`/home/practice-tests/${test.id}?goal=1`}
      className="block w-full rounded-lg bg-[#d87f1d] py-1.5 text-center text-sm font-semibold text-white hover:opacity-90"
    >
      🎯 Set My Study Goal
    </Link>
  ) : (
    <Link
      to={`/practice-tests/${test.id}/take`}
      className="block w-full rounded-lg bg-[#155EEF] py-1.5 text-center text-sm font-semibold text-white transition-colors hover:bg-[#004EEB]"
    >
      {answered > 0 ? 'Resume' : 'Start Practice'}
    </Link>
  );

  const footer = !owned ? (
    inCart ? (
      <Link to="/home/cart" className="block rounded-lg border border-[#155EEF]/50 py-1.5 text-center text-sm font-semibold text-[#155EEF]">
        ✓ In Cart · View Cart
      </Link>
    ) : (
      <div className="flex gap-2">
        <button
          type="button"
          disabled={addingToCart || paying}
          onClick={onAddToCart}
          className="flex-1 rounded-lg border border-[#CBD5E1] bg-white py-1.5 text-sm font-semibold text-[#334155] transition-colors hover:border-[#155EEF] hover:bg-[#F8FAFF] hover:text-[#155EEF] disabled:opacity-60"
        >
          Add to Cart
        </button>
        <button
          type="button"
          disabled={paying}
          onClick={onBuyNow}
          className="flex-1 rounded-lg bg-[#155EEF] py-1.5 text-sm font-semibold text-white transition-colors hover:bg-[#004EEB] disabled:opacity-60"
        >
          {paying ? 'Opening…' : 'Buy Now'}
        </button>
      </div>
    )
  ) : (
    primaryOwnedAction
  );

  return (
    <ProductCardShell
      id={test.id}
      itemType="practiceTest"
      title={test.title}
      category={test.category ?? 'Other'}
      skillLevel={test.skillLevel ?? 'Foundation'}
      ratingAvg={test.ratingAvg ?? 0}
      ratingCount={test.ratingCount ?? 0}
      price={price}
      originalPrice={test.originalPrice ?? null}
      currency={test.currency ?? 'INR'}
      detailHref={detailHref}
      footer={footer}
    />
  );
}
