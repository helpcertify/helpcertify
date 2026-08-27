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

// Turns a free-text description into short bullet points for the hover
// card — one line per newline if the admin already wrote it that way,
// otherwise a naive sentence split. Capped so a very long description can't
// blow out the hover card's height.
function descriptionBullets(description: string): string[] {
  const byLine = description.split('\n').map((l) => l.trim()).filter(Boolean);
  const raw = byLine.length > 1 ? byLine : description.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  return raw.slice(0, 5);
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

// A Udemy-style card: the base card stays deliberately minimal (name over a
// colored banner, rating, price, one primary action), and hovering it
// (desktop only — lg:) pops out a second, fuller card beside it (not on top
// of it) with the actual description, full stats, and every action, instead
// of cramming all of that into the grid at all times.
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
  const bullets = test.description ? descriptionBullets(test.description) : [];

  const primaryOwnedAction = done ? (
    <button
      type="button"
      onClick={onDownloadCertificate}
      className="w-full rounded-lg border border-brand-400 py-1.5 text-sm font-medium text-brand-ink hover:bg-brand-500/10"
    >
      🎓 Download Certificate
    </button>
  ) : test.studyPlannerEnabled !== false ? (
    <Link
      to={`/home/practice-tests/${test.id}?goal=1`}
      className="block w-full rounded-lg bg-[#d87f1d] py-1.5 text-center text-sm font-medium text-white hover:opacity-90"
    >
      🎯 Set Your Study Goal
    </Link>
  ) : (
    <Link
      to={`/practice-tests/${test.id}/take`}
      className="block w-full rounded-lg bg-[#1D4ED8] py-1.5 text-center text-sm font-medium text-white hover:opacity-90"
    >
      {answered > 0 ? 'Resume' : 'Start'}
    </Link>
  );

  return (
    <div className="group relative">
      {/* Base card — always visible. */}
      <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-raised">
        <Link to={detailHref}>
          <CourseCoverImage id={test.id} title={test.title} className="h-24 w-full" />
        </Link>
        <div className="relative p-3.5">
          {!owned && <WishlistButton itemType="practiceTest" itemId={test.id} variant="inline" className="absolute right-2.5 top-2.5" />}
          <Link to={detailHref} className="hover:text-brand-ink">
            <h3 className="mb-1 line-clamp-2 pr-8 text-sm font-bold leading-snug text-ink">{test.title}</h3>
          </Link>
          {(test.ratingCount ?? 0) > 0 ? (
            <div className="mb-2 flex items-center gap-1.5">
              <StarRating value={test.ratingAvg ?? 0} size="sm" />
              <span className="text-xs text-ink-faint">
                {(test.ratingAvg ?? 0).toFixed(1)} ({test.ratingCount})
              </span>
            </div>
          ) : (
            <div className="mb-2 text-xs text-ink-faint">No ratings yet</div>
          )}
          <div className="mb-3 flex items-center gap-2">
            {price > 0 ? (
              <>
                {test.originalPrice && test.originalPrice > price && (
                  <span className="text-xs text-ink-faint line-through">{formatMoney(test.originalPrice, test.currency)}</span>
                )}
                <span className="font-semibold text-ink">{formatMoney(price, test.currency)}</span>
              </>
            ) : (
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">Free</span>
            )}
          </div>

          {!owned ? (
            inCart ? (
              <Link to="/home/cart" className="block rounded-lg border border-[#1D4ED8]/50 py-1.5 text-center text-sm font-medium text-[#1D4ED8]">
                ✓ In Cart · View Cart
              </Link>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={addingToCart || paying}
                  onClick={onAddToCart}
                  className="flex-1 rounded-lg border border-surface-border py-1.5 text-sm font-medium text-ink-muted hover:opacity-80 disabled:opacity-60"
                >
                  Add to Cart
                </button>
                <button
                  type="button"
                  disabled={paying}
                  onClick={onBuyNow}
                  className="flex-1 rounded-lg bg-[#1D4ED8] py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
                >
                  {paying ? 'Opening…' : 'Buy Now'}
                </button>
              </div>
            )
          ) : (
            primaryOwnedAction
          )}
        </div>
      </div>

      {/* Hover popover — desktop only (lg:), Udemy-style: floats beside the
          card rather than on top of it (offset right, no repeated cover
          image), with a small triangular pointer on its left edge tying it
          back visually to the card it came from. Positioned absolute so it
          never shifts grid layout; it's allowed to overlap the next card
          since only one can be hovered at a time. */}
      <div className="pointer-events-none invisible absolute -top-3 left-0 z-30 hidden w-[300px] opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:visible group-hover:opacity-100 lg:block">
        {/* Pointer notch, tied to the card's left edge (border-matched
            square rotated 45deg, the classic speech-bubble tail trick). */}
        <div className="absolute left-3 top-9 h-3.5 w-3.5 rotate-45 border-b border-l border-surface-border bg-surface-raised" />
        <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-raised p-4 shadow-2xl">
          <h3 className="mb-1.5 font-bold leading-snug text-ink">{test.title}</h3>
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-[#1D4ED8] px-2 py-0.5 text-xs font-semibold text-white">{test.category ?? 'Other'}</span>
            <span className="rounded bg-surface px-2 py-0.5 text-xs text-ink-muted">{test.skillLevel ?? 'Foundation'}</span>
          </div>
          {(test.ratingCount ?? 0) > 0 && (
            <div className="mb-2 flex items-center gap-1.5">
              <StarRating value={test.ratingAvg ?? 0} size="sm" />
              <span className="text-xs text-ink-faint">
                {(test.ratingAvg ?? 0).toFixed(1)} ({test.ratingCount} review{test.ratingCount === 1 ? '' : 's'})
              </span>
            </div>
          )}
          <div className="mb-3 text-xs text-ink-faint">
            📄 {test.totalQuestions} questions ·{' '}
            {test.durationPerSessionMinutes ? `${test.durationPerSessionMinutes} min/session` : 'you choose session length'}
            {owned && <> · {answered}/{test.totalQuestions} answered</>}
          </div>
          {bullets.length > 0 && (
            <ul className="mb-3 space-y-1.5 text-xs text-ink-muted">
              {bullets.map((b, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-emerald-600 dark:text-emerald-400">✓</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}

          {!owned ? (
            inCart ? (
              <Link to="/home/cart" className="block rounded-lg border border-[#1D4ED8]/50 py-1.5 text-center text-sm font-medium text-[#1D4ED8]">
                ✓ In Cart · View Cart
              </Link>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={paying}
                  onClick={onBuyNow}
                  className="flex-1 rounded-lg bg-[#1D4ED8] py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
                >
                  {paying ? 'Opening…' : 'Buy Now'}
                </button>
                <button
                  type="button"
                  disabled={addingToCart || paying}
                  onClick={onAddToCart}
                  aria-label="Add to cart"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-surface-border text-ink-muted hover:border-brand-400 hover:text-brand-ink disabled:opacity-60"
                >
                  🛒
                </button>
              </div>
            )
          ) : (
            <div className="flex flex-col gap-1.5">
              {!done && (
                <div className="flex gap-2">
                  <Link
                    to={`/practice-tests/${test.id}/take`}
                    className="flex-1 rounded-lg bg-[#1D4ED8] py-1.5 text-center text-sm font-medium text-surface"
                  >
                    {answered > 0 ? 'Resume' : 'Start'}
                  </Link>
                  {answered > 0 && (
                    <Link
                      to={`/practice-tests/${test.id}/take?reattempt=1`}
                      className="flex-1 rounded-lg border border-surface-border py-1.5 text-center text-sm text-ink-muted"
                    >
                      Reattempt
                    </Link>
                  )}
                </div>
              )}
              {!done && test.studyPlannerEnabled !== false && (
                <Link
                  to={`/home/practice-tests/${test.id}?goal=1`}
                  className="block rounded-lg bg-[#d87f1d] py-1.5 text-center text-sm font-medium text-white hover:opacity-90"
                >
                  🎯 Set Your Study Goal
                </Link>
              )}
              {done && (
                <button
                  type="button"
                  onClick={onDownloadCertificate}
                  className="rounded-lg border border-brand-400 py-1.5 text-sm font-medium text-brand-ink hover:bg-brand-500/10"
                >
                  🎓 Download Certificate
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
