import { useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getPracticeTestById } from '../api/studentContentApi';
import { getStudyPlan } from '../api/studyPlanApi';
import { cartApi } from '../api/cartApi';
import { useCheckout } from '../hooks/useCheckout';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { useUiStore } from '@/store/useUiStore';
import { toDate } from '@/utils/formatDate';
import { formatMoney } from '@/utils/currency';
import { BuyNowModal } from '@/components/common/BuyNowModal';
import { CourseIcon } from '@/components/common/CourseIcon';
import { StarRating } from '@/components/common/StarRating';
import { ReviewsSection } from '@/components/common/ReviewsSection';
import { PreviewQuestions } from '@/components/common/PreviewQuestions';
import { WishlistButton } from '@/components/common/WishlistButton';
import { StudyGoalPanel } from '../components/StudyGoalPanel';
import { computeExamDatePlan, computePacePlan, questionsPerDayFromMinutes } from '../lib/studyPlan';

function formatDate(ts: unknown): string {
  return toDate(ts).toLocaleDateString();
}

// Only shown when the admin left session length up to the student
// (test.durationPerSessionMinutes is null) — same preset spirit as the
// admin's own availability-window shortcuts, but for picking one session's
// length rather than a purchase window.
const SESSION_DURATION_PRESETS = [15, 30, 45, 60, 90, 120];

// A fixed 10-question free sample regardless of the admin's own
// previewQuestionCount setting (which still governs the free-preview limit
// enforced server-side in api/practice-session.ts) — on request, so every
// visitor sees the same "try 10 questions" experience. Falls back to the
// admin's own count only if they deliberately set something smaller (a
// disabled preview, previewQuestionCount: 0, still means no preview at all).
const SAMPLE_PREVIEW_COUNT = 10;

// Master HelpCertify design-system layout: a full-width header row (badges,
// title, rating, stat line, decorative mark), then a two-column row —
// Practice Setup + Study Plan when owned, or Course Access + Free Preview
// when not — then Study Goal full-width, then Reviews full-width. No
// recommendations carousel on this page, on request (kept on the browse
// pages, MockExamsPage/PracticeTestsPage/etc). Purely a visual pass — the
// underlying data/mutations are unchanged from before this restyle.
export function PracticeTestDetailPage() {
  const { testId } = useParams<{ testId: string }>();
  const uid = useAuthStore((s) => s.firebaseUser?.uid);
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const { checkout, paying, confirmation } = useCheckout();
  const [showBuyNow, setShowBuyNow] = useState(false);
  const [chosenDuration, setChosenDuration] = useState(SESSION_DURATION_PRESETS[2]);
  // Inline goal-setup, not a separate page/route — every other entry point
  // (the Practice Exams card, its hover popover, the dashboard nudge, the
  // purchase-success modal) links here with ?goal=1 rather than to a
  // /study-plan route, so this single flag opens the same panel regardless
  // of where the learner came from.
  const [searchParams, setSearchParams] = useSearchParams();
  const [showGoalPanel, setShowGoalPanel] = useState(searchParams.get('goal') === '1');

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
  const { data: existingPlan } = useQuery({
    queryKey: ['student', 'studyPlan', uid, testId],
    queryFn: () => getStudyPlan(uid!, testId!),
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
  const previewCount = test.previewQuestionCount === 0 ? 0 : SAMPLE_PREVIEW_COUNT;

  return (
    // Fills the width StudentShell's sidebar leaves available (up to a
    // 1440px cap) instead of centering a much-narrower fixed column inside
    // it — that mismatch was the source of the large dead margins either
    // side of the page.
    <div className="mx-auto w-[calc(100%-48px)] max-w-[1440px]">
      <Link to="/home/practice-tests" className="mb-4 inline-block text-sm text-brand-ink hover:underline">
        ← Back to Practice Exams
      </Link>

      {/* Header — full width, badges/title/rating/stats on the left, a
          decorative certification mark on the right. Description text is
          capped at ~750px even though the row itself spans the page, so
          long paragraphs stay readable. */}
      <div className="mb-6 flex flex-col justify-between gap-6 rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-[0_2px_8px_rgba(15,23,42,0.05)] dark:bg-surface-raised sm:flex-row sm:items-center">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#64748B]">
            <span>{test.category ?? 'Other'}</span>
            <span>·</span>
            <span>{test.skillLevel ?? 'Foundation'}</span>
          </div>
          <h1 className="mb-2 text-[28px] font-bold leading-tight text-[#0F172A]">{test.title}</h1>

          {(test.ratingCount ?? 0) > 0 && (
            <div className="mb-3 flex items-center gap-2">
              <StarRating value={test.ratingAvg ?? 0} size="sm" />
              <span className="text-sm text-[#64748B]">
                {(test.ratingAvg ?? 0).toFixed(1)} ({test.ratingCount} review{test.ratingCount === 1 ? '' : 's'})
              </span>
            </div>
          )}

          {/* One horizontal line with bullet separators rather than a
              stack — same three facts as before, grouped tighter. */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[#475569]">
            <span>▣ {test.totalQuestions} Questions</span>
            <span className="text-[#CBD5E1]">•</span>
            <span>◷ {owned ? `${answered}/${test.totalQuestions} Answered` : 'Not started'}</span>
            <span className="text-[#CBD5E1]">•</span>
            <span>{test.category ?? 'Other'}</span>
          </div>

          {test.description && (
            <p className="mt-4 max-w-[750px] whitespace-pre-line text-sm leading-relaxed text-[#1E293B]">{test.description}</p>
          )}
        </div>

        {/* Decorative certification mark — reuses the same icon tile every
            product card already uses, just larger, rather than a bespoke
            illustration asset. */}
        <div className="hidden shrink-0 items-center justify-center rounded-xl bg-[#EFF6FF] p-6 sm:flex">
          <div className="scale-[1.8]">
            <CourseIcon id={test.id} title={test.title} itemType="practiceTest" />
          </div>
        </div>
      </div>

      {/* Two-column row: Practice Setup + Study Plan when owned, Course
          Access + Free Preview when not. Study Plan gets slightly more
          width — it's carrying progress, exam countdown, and today's
          target, more content than Practice Setup's duration picker. */}
      {owned ? (
        <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <PracticeSetupCard
            test={test}
            done={done}
            answered={answered}
            chosenDuration={chosenDuration}
            onChooseDuration={setChosenDuration}
          />
          {test.studyPlannerEnabled !== false ? (
            <div>
              {existingPlan ? (
                <PlanSummaryCard test={test} answered={answered} plan={existingPlan} onEdit={() => setShowGoalPanel(true)} />
              ) : (
                <div className="flex h-full flex-col justify-center rounded-xl border border-[#E2E8F0] bg-white p-6 text-center shadow-[0_2px_8px_rgba(15,23,42,0.05)] dark:bg-surface-raised">
                  <p className="mb-4 text-sm text-[#64748B]">No study plan set yet for this practice test.</p>
                  <button
                    type="button"
                    onClick={() => setShowGoalPanel((v) => !v)}
                    className="rounded-lg border border-[#155EEF] bg-white px-4 py-2 text-sm font-semibold text-[#155EEF] hover:bg-[#EFF6FF] dark:bg-transparent"
                  >
                    {showGoalPanel ? '✕ Hide Study Goal' : '🎯 Set My Study Goal'}
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-[0.7fr_1.3fr] lg:items-start">
          <CourseAccessCard
            test={test}
            price={price}
            state={state}
            owned={owned}
            inCart={inCart}
            paying={paying}
            addingToCart={addToCartMutation.isPending}
            onAddToCart={() => addToCartMutation.mutate(test.id)}
            onBuyNow={() => setShowBuyNow(true)}
          />
          {previewCount > 0 ? (
            <PreviewQuestions
              itemType="practiceTest"
              itemId={test.id}
              previewQuestionCount={previewCount}
              onBuyNow={() => setShowBuyNow(true)}
            />
          ) : (
            <div className="rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-[0_2px_8px_rgba(15,23,42,0.05)] dark:bg-surface-raised">
              <h2 className="mb-2 text-[15px] font-bold uppercase tracking-wide text-[#155EEF]">Free Preview</h2>
              <p className="text-sm text-[#64748B]">No free preview is available for this practice test.</p>
            </div>
          )}
        </div>
      )}

      {/* Study Goal — full width, below the two-column row. Kept as a
          click-to-open panel rather than always-expanded (the underlying
          interaction, not just its skin) — same behavior as before this
          restyle. */}
      {owned && test.studyPlannerEnabled !== false && showGoalPanel && (
        <div className="mb-6">
          <StudyGoalPanel
            testId={test.id}
            test={test}
            onSaved={() => {
              setShowGoalPanel(false);
              setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                next.delete('goal');
                return next;
              });
            }}
          />
        </div>
      )}

      <ReviewsSection itemType="practiceTest" itemId={test.id} owned={owned} />

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

// Section 11 of the design system: session-duration presets (unchanged
// functionality) plus the Start Practice / Reattempt actions, restyled into
// its own card instead of living inside a purchase-card sidebar.
function PracticeSetupCard({
  test,
  done,
  answered,
  chosenDuration,
  onChooseDuration,
}: {
  test: { id: string; durationPerSessionMinutes: number | null };
  done: boolean;
  answered: number;
  chosenDuration: number;
  onChooseDuration: (m: number) => void;
}) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-[0_2px_8px_rgba(15,23,42,0.05)] dark:bg-surface-raised">
      <h2 className="mb-4 text-[15px] font-bold uppercase tracking-wide text-[#155EEF]">Practice Setup</h2>

      {/* Only shown when the admin left session length up to the student
          (test.durationPerSessionMinutes is null) — an already-resumable
          session ignores this, since its duration was already fixed when
          it started. */}
      {test.durationPerSessionMinutes == null && !done && (
        <div className="mb-4">
          <label className="mb-2 block text-xs font-medium text-[#64748B]">Session Duration</label>
          <div className="flex flex-wrap gap-2">
            {SESSION_DURATION_PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onChooseDuration(m)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium ${
                  chosenDuration === m ? 'border-[#155EEF] bg-[#155EEF] text-white' : 'border-[#CBD5E1] bg-white text-[#334155] dark:bg-transparent'
                }`}
              >
                {m} min
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {!done && (
          <Link
            to={
              test.durationPerSessionMinutes == null
                ? `/practice-tests/${test.id}/take?sessionDuration=${chosenDuration}`
                : `/practice-tests/${test.id}/take`
            }
            className="block w-full rounded-lg bg-[#155EEF] py-2.5 text-center text-sm font-semibold text-white hover:bg-[#004EEB]"
          >
            {answered > 0 ? 'Resume →' : 'Start Practice →'}
          </Link>
        )}
        {answered > 0 && (
          <Link
            to={
              test.durationPerSessionMinutes == null
                ? `/practice-tests/${test.id}/take?reattempt=1&sessionDuration=${chosenDuration}`
                : `/practice-tests/${test.id}/take?reattempt=1`
            }
            className="block w-full rounded-lg border border-[#155EEF] py-2.5 text-center text-sm font-semibold text-[#155EEF] hover:bg-[#EFF6FF]"
          >
            Reattempt
          </Link>
        )}
      </div>
    </div>
  );
}

interface CourseAccessTest {
  id: string;
  originalPrice: number | null;
  currency: 'INR' | 'USD';
  availableFrom: unknown;
  availableUntil: unknown;
}

// Section 16/18: the purchase card for a not-yet-owned test — Buy Now / Add
// to Cart / wishlist, same mutations as before, restyled.
function CourseAccessCard({
  test,
  price,
  state,
  owned,
  inCart,
  paying,
  addingToCart,
  onAddToCart,
  onBuyNow,
}: {
  test: CourseAccessTest;
  price: number;
  state: 'available' | 'upcoming' | 'expired';
  owned: boolean;
  inCart: boolean;
  paying: boolean;
  addingToCart: boolean;
  onAddToCart: () => void;
  onBuyNow: () => void;
}) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-[0_2px_8px_rgba(15,23,42,0.05)] dark:bg-surface-raised">
      <h2 className="mb-4 text-[15px] font-bold uppercase tracking-wide text-[#155EEF]">Course Access</h2>

      {price > 0 && (
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {test.originalPrice && test.originalPrice > price && (
              <span className="text-sm text-[#94A3B8] line-through">{formatMoney(test.originalPrice, test.currency)}</span>
            )}
            <span className="text-[26px] font-bold text-[#0F172A]">{formatMoney(price, test.currency)}</span>
          </div>
          {!owned && <WishlistButton itemType="practiceTest" itemId={test.id} variant="inline" />}
        </div>
      )}

      {state !== 'available' ? (
        <div className="rounded-lg bg-[#FFF7ED] px-3 py-2.5 text-center text-sm text-[#C2410C]">
          🔒 {state === 'expired' ? 'Expired' : 'Upcoming'}. Available {formatDate(test.availableFrom)} → {formatDate(test.availableUntil)}
        </div>
      ) : inCart ? (
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
            onClick={onBuyNow}
            className="w-full rounded-lg bg-[#155EEF] py-2.5 text-sm font-semibold text-white hover:bg-[#004EEB] disabled:opacity-60"
          >
            {paying ? 'Opening…' : 'Buy Now'}
          </button>
          <button
            type="button"
            disabled={addingToCart || paying}
            onClick={onAddToCart}
            className="w-full rounded-lg border border-[#155EEF] py-2.5 text-sm font-semibold text-[#155EEF] hover:bg-[#EFF6FF] disabled:opacity-60"
          >
            {addingToCart ? 'Adding…' : 'Add to Cart'}
          </button>
        </div>
      )}
    </div>
  );
}

// A compact "here's your plan" readout once a study goal already exists —
// the same daily target/countdown/progress numbers StudyGoalPanel and the
// Home dashboard compute, condensed to a glance instead of the full
// two-column setup form. Editing re-opens that full form (StudyGoalPanel)
// rather than duplicating its inputs here.
function PlanSummaryCard({
  test,
  answered,
  plan,
  onEdit,
}: {
  test: { totalQuestions: number; revisionBufferDays?: number; defaultMinutesPerQuestion?: number };
  answered: number;
  plan: NonNullable<Awaited<ReturnType<typeof getStudyPlan>>>;
  onEdit: () => void;
}) {
  const today = new Date();
  const totalQuestions = test.totalQuestions ?? 0;
  const minutesPerQuestion = test.defaultMinutesPerQuestion ?? 1.8;
  const percentComplete = totalQuestions > 0 ? Math.round((answered / totalQuestions) * 100) : 0;

  let dailyTarget: number;
  let countdownLabel: string;
  let countdownValue: string;

  if (plan.planningMode === 'examDate' && plan.targetExamDate) {
    const examPlan = computeExamDatePlan({
      today,
      targetExamDate: toDate(plan.targetExamDate),
      totalQuestions,
      uniqueAnsweredCount: answered,
      studyDays: plan.studyDays,
      revisionBufferDays: plan.revisionBufferDays,
      minutesPerQuestion,
    });
    dailyTarget = examPlan.dailyTarget;
    countdownLabel = examPlan.daysToExam >= 0 ? `${examPlan.daysToExam} Days` : 'Passed';
    countdownValue = 'to your exam';
  } else {
    dailyTarget = plan.paceQuestionsPerDay ?? questionsPerDayFromMinutes(plan.paceMinutesPerDay ?? 0, minutesPerQuestion);
    const pacePlan = computePacePlan({
      today,
      totalQuestions,
      uniqueAnsweredCount: answered,
      studyDays: plan.studyDays,
      revisionBufferDays: plan.revisionBufferDays,
      minutesPerQuestion,
      paceQuestionsPerDay: dailyTarget,
    });
    countdownLabel = `~${pacePlan.suggestedExamDate.toLocaleDateString()}`;
    countdownValue = 'suggested exam';
  }

  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-[0_2px_8px_rgba(15,23,42,0.05)] dark:bg-surface-raised">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[15px] font-bold uppercase tracking-wide text-[#155EEF]">Your Study Plan</h2>
        <button type="button" onClick={onEdit} className="text-xs font-medium text-[#155EEF] hover:underline">
          Edit Study Plan
        </button>
      </div>

      {/* Three stats across the card's full width — the days-to-exam
          countdown, completion progress, and today's target used to be
          three separately-boxed rows; grouping them into one row uses the
          Study Plan card's extra width (0.9fr/1.1fr split above) instead
          of leaving it empty. */}
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <div className="text-[26px] font-bold text-[#0F172A]">📅 {countdownLabel}</div>
          <div className="text-xs text-[#64748B]">{countdownValue}</div>
        </div>
        <div>
          <div className="text-[26px] font-bold text-[#0F172A]">
            {answered}/{totalQuestions}
          </div>
          <div className="text-xs text-[#64748B]">completed ({percentComplete}%)</div>
        </div>
        <div>
          <div className="text-[26px] font-bold text-[#155EEF]">
            {dailyTarget} Q{dailyTarget === 1 ? '' : 's'}
          </div>
          <div className="text-xs text-[#64748B]">today's target</div>
        </div>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#F1F5F9]">
        <div className="h-full rounded-full bg-[#155EEF]" style={{ width: `${Math.min(100, percentComplete)}%` }} />
      </div>
    </div>
  );
}
