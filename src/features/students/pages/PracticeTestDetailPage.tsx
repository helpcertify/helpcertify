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
import { RelatedItems } from '@/components/common/RelatedItems';
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

// The "course landing page" a student sees before (or after) buying a
// practice test, reached by clicking a card rather than acting on its
// buttons directly. Laid out Udemy-style: plain heading + description in
// the main column, a compact sticky sidebar for the cover/price/actions,
// rather than one big bordered card wrapping the whole page (that was
// tried and removed on request — it didn't use the page's width well).
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
    <div className="mx-auto max-w-6xl">
      <Link to="/home/practice-tests" className="mb-4 inline-block text-sm text-brand-ink hover:underline">
        ← Back to Practice Exams
      </Link>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        {/* Main column — heading, description, all the details, then the
            free sample or reviews below. No bordered card wrapping this;
            the page background itself is the canvas, same as a Udemy
            course landing page. */}
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs uppercase tracking-wide text-ink-faint">
            <span>{test.category ?? 'Other'}</span>
            <span>·</span>
            <span>{test.skillLevel ?? 'Foundation'}</span>
          </div>
          <h1 className="mb-2 text-3xl font-bold leading-tight text-ink">{test.title}</h1>

          {(test.ratingCount ?? 0) > 0 && (
            <div className="mb-3 flex items-center gap-2">
              <StarRating value={test.ratingAvg ?? 0} size="sm" />
              <span className="text-sm text-ink-faint">
                {(test.ratingAvg ?? 0).toFixed(1)} ({test.ratingCount} review{test.ratingCount === 1 ? '' : 's'})
              </span>
            </div>
          )}

          <div className="mb-6 flex flex-wrap gap-4 text-sm text-ink-faint">
            <span>📄 {test.totalQuestions} questions</span>
            <span>⏱ {test.durationPerSessionMinutes ? `${test.durationPerSessionMinutes} min/session` : 'You choose the session length'}</span>
            {owned && (
              <span>
                ✅ {answered}/{test.totalQuestions} answered
              </span>
            )}
          </div>

          {test.description && (
            <div className="mb-6">
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-faint">About this practice test</h2>
              <p className="whitespace-pre-line text-sm text-ink-muted">{test.description}</p>
            </div>
          )}

          {/* Same fixed 10 questions, same order, for every visitor every
              time — see getPracticeTestPreviewQuestions's orderBy('order'),
              nothing here randomizes or re-samples on reload. */}
          {!owned && previewCount > 0 && (
            <PreviewQuestions itemType="practiceTest" itemId={test.id} previewQuestionCount={previewCount} />
          )}

          {showGoalPanel && test.studyPlannerEnabled !== false && (
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
          )}

          <ReviewsSection itemType="practiceTest" itemId={test.id} owned={owned} />
        </div>

        {/* Sidebar — cover thumbnail, price, and every action, sticky so it
            stays visible while the main column's description/reviews
            scroll past it. */}
        <div className="lg:sticky lg:top-20">
          <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-raised">
            {/* Same light-blue gradient + icon header as every product
                card in the app, not a colored cover banner — the learner
                is already on this item's own page, so this is just a
                consistent identity strip, not another clickable card. */}
            <div className="flex items-center gap-3 bg-gradient-to-br from-[#EFF6FF] to-[#DBEAFE] p-4">
              <CourseIcon id={test.id} title={test.title} itemType="practiceTest" />
              <h2 className="line-clamp-2 text-base font-semibold leading-snug text-[#0F172A]">{test.title}</h2>
            </div>
            <div className="p-5">
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
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      disabled={paying}
                      onClick={() => setShowBuyNow(true)}
                      className="w-full rounded-lg bg-[#1D4ED8] py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
                    >
                      {paying ? 'Opening…' : 'Buy Now'}
                    </button>
                    <button
                      type="button"
                      disabled={addToCartMutation.isPending || paying}
                      onClick={() => addToCartMutation.mutate(test.id)}
                      className="w-full rounded-lg border border-surface-border py-2.5 text-sm font-medium text-ink-muted hover:opacity-80 disabled:opacity-60"
                    >
                      Add to Cart
                    </button>
                  </div>
                )
              ) : (
                <div>
                  {/* Only shown when the admin left session length up to the
                      student (test.durationPerSessionMinutes is null) — an
                      already-resumable session ignores this, since its
                      duration was already fixed when it started. */}
                  {test.durationPerSessionMinutes == null && !done && (
                    <div className="mb-3">
                      <label className="mb-1 block text-xs text-ink-faint">Session duration</label>
                      <div className="flex flex-wrap gap-1.5">
                        {SESSION_DURATION_PRESETS.map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setChosenDuration(m)}
                            className={`rounded-full border px-3 py-1 text-xs ${
                              chosenDuration === m
                                ? 'border-[#1D4ED8] bg-[#1D4ED8]/10 text-[#1D4ED8]'
                                : 'border-surface-border text-ink-muted hover:border-brand-400'
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
                        className="block w-full rounded-lg bg-[#1D4ED8] py-2.5 text-center text-sm font-medium text-surface"
                      >
                        {answered > 0 ? 'Resume' : 'Start Practice'}
                      </Link>
                    )}
                    {answered > 0 && (
                      <Link
                        to={
                          test.durationPerSessionMinutes == null
                            ? `/practice-tests/${test.id}/take?reattempt=1&sessionDuration=${chosenDuration}`
                            : `/practice-tests/${test.id}/take?reattempt=1`
                        }
                        className="block w-full rounded-lg border border-surface-border py-2.5 text-center text-sm text-ink-muted"
                      >
                        Reattempt
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Study goal — either a compact live summary of the plan already
              in place (with an Edit link into the full panel above), or the
              single call-to-action to create one. Kept out of the bordered
              price/action card above since it's a distinct concern, not
              another purchase-flow action. */}
          {owned && test.studyPlannerEnabled !== false && (
            <div className="mt-4">
              {existingPlan ? (
                <PlanSummaryCard
                  test={test}
                  answered={answered}
                  plan={existingPlan}
                  onEdit={() => setShowGoalPanel(true)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setShowGoalPanel((v) => !v)}
                  className="block w-full rounded-lg border border-[#d87f1d] bg-[#d87f1d]/10 py-2.5 text-center text-sm font-medium text-[#d87f1d] hover:bg-[#d87f1d]/20"
                >
                  {showGoalPanel ? '✕ Hide Study Goal' : '🎯 Set Your Study Goal'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Full-width, below the two-column layout entirely (not squeezed
          into the narrow main column), so all 4 cards are visible without
          the card itself getting cramped by the sticky sidebar. */}
      <RelatedItems category={test.category ?? 'Other'} excludeItemType="practiceTest" excludeItemId={test.id} />

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
    countdownLabel = examPlan.daysToExam >= 0 ? `📅 ${examPlan.daysToExam} days to exam` : 'Exam date has passed';
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
    countdownLabel = `🏁 Suggested exam: ${pacePlan.suggestedExamDate.toLocaleDateString()}`;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[#1D4ED8]/30 bg-surface-raised">
      <div className="flex items-center justify-between bg-gradient-to-r from-[#1D4ED8] to-[#0f2f8f] px-4 py-2.5">
        <h3 className="text-xs font-bold uppercase tracking-wide text-white">Your Study Goal</h3>
        <button type="button" onClick={onEdit} className="text-xs font-medium text-white/80 hover:text-white hover:underline">
          Edit
        </button>
      </div>
      <div className="p-4">
        <p className="mb-3 text-xs text-ink-faint">{countdownLabel}</p>
        <div className="mb-1 flex items-center justify-between text-xs text-ink-faint">
          <span>
            {answered} / {totalQuestions} questions
          </span>
          <span>{percentComplete}%</span>
        </div>
        <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-surface">
          <div className="h-full rounded-full bg-[#1D4ED8]" style={{ width: `${Math.min(100, percentComplete)}%` }} />
        </div>
        <div className="rounded-lg bg-surface p-3 text-center">
          <div className="text-[10px] uppercase tracking-wide text-ink-faint">Today's Target</div>
          <div className="text-xl font-bold text-ink">{dailyTarget} question{dailyTarget === 1 ? '' : 's'}</div>
        </div>
      </div>
    </div>
  );
}
