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
import { toDate, formatShortDate } from '@/utils/formatDate';
import { formatMoney } from '@/utils/currency';
import { BuyNowModal } from '@/components/common/BuyNowModal';
import { CourseIcon } from '@/components/common/CourseIcon';
import { StarRating } from '@/components/common/StarRating';
import { ReviewsSection } from '@/components/common/ReviewsSection';
import { PreviewQuestions } from '@/components/common/PreviewQuestions';
import { WishlistButton } from '@/components/common/WishlistButton';
import { StudyGoalPanel } from '../components/StudyGoalPanel';
import { computeExamDatePlan, computePacePlan, questionsPerDayFromMinutes } from '../lib/studyPlan';
import type { PracticeConfidence } from '@/types/models';

function formatDate(ts: unknown): string {
  return toDate(ts).toLocaleDateString();
}

// Practice Question Bank session sizing — question count is the primary
// control (not a duration in minutes, even for a test the admin gave a
// fixed durationPerSessionMinutes; that field is now purely the basis for
// the secondary "approximately N minutes" estimate below, never a gate on
// starting or how long a session lasts — see api/practice-session.ts's
// header comment on SESSION_STALE_HOURS).
const SESSION_SIZE_PRESETS = [
  { size: 10, label: 'Quick Practice' },
  { size: 25, label: 'Focus Session', recommended: true },
  { size: 50, label: 'Deep Practice' },
] as const;
const DEFAULT_SESSION_SIZE = 25;
const MAX_CUSTOM_SESSION_SIZE = 200;

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
  const [sessionSize, setSessionSize] = useState<number>(DEFAULT_SESSION_SIZE);
  const [customSize, setCustomSize] = useState('');
  const [feedbackMode, setFeedbackMode] = useState<'immediate' | 'end_of_session'>('immediate');
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
      return {
        answeredQuestionIds: (data.answeredQuestionIds as string[]) ?? [],
        incorrectQuestionIds: (data.incorrectQuestionIds as string[]) ?? [],
        questionStats:
          (data.questionStats as Record<string, { attempts: number; correct: number; lastConfidence?: PracticeConfidence }>) ?? {},
      };
    },
    enabled: !!uid && !!testId,
  });
  const { data: existingPlan } = useQuery({
    queryKey: ['student', 'studyPlan', uid, testId],
    queryFn: () => getStudyPlan(uid!, testId!),
    enabled: !!uid && !!testId,
  });
  // "Continue where you left off" — an unfinished (in_progress) session,
  // read directly via the client SDK same as the queries above (firestore.
  // rules already lets a signed-in learner read their own practiceSessions
  // docs). Only ever one in_progress session per learner per test (see
  // api/practice-session.ts's startOrResumeBatch), so a single doc read.
  const { data: unfinishedSession } = useQuery({
    queryKey: ['student', 'unfinishedPracticeSession', uid, testId],
    queryFn: async () => {
      const snap = await getDocs(
        query(
          collection(db, 'practiceSessions'),
          where('userId', '==', uid),
          where('testId', '==', testId),
          where('status', '==', 'in_progress')
        )
      );
      if (snap.empty) return null;
      const data = snap.docs[0].data();
      return { id: snap.docs[0].id, batchSize: (data.batchQuestionIds as string[]).length, answeredCount: data.answeredCount as number };
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
  const previewCount = test.previewQuestionCount === 0 ? 0 : SAMPLE_PREVIEW_COUNT;

  // Intelligent Learning (Release 3) — derived entirely from
  // practiceProgress.questionStats, never a separate stored value. Weak
  // Areas: persistently-low cumulative accuracy (a longer memory than
  // incorrectQuestionIds, which only reflects the single most recent
  // attempt). Accuracy: cumulative correct/attempts across every answered
  // question — not "first-attempt accuracy" specifically, since that isn't
  // tracked separately from cumulative attempts.
  const questionStats = progress?.questionStats ?? {};
  const statsEntries = Object.values(questionStats);
  const weakAreasCount = statsEntries.filter((s) => s.attempts > 0 && s.correct / s.attempts < 0.5).length;
  const totalAttempts = statsEntries.reduce((sum, s) => sum + s.attempts, 0);
  const totalCorrect = statsEntries.reduce((sum, s) => sum + s.correct, 0);
  const overallAccuracy = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0;

  // Section 29's Question Bank Dashboard — Mastered/Learning/Needs Review
  // buckets, derived from questionStats + incorrectQuestionIds rather than
  // a separately stored state (Section 8: "do not unnecessarily duplicate
  // data if these states can be derived reliably from existing attempt
  // records"). Needs Review reuses incorrectQuestionIds (last answer
  // wrong); Mastered/Learning splits the rest by cumulative accuracy.
  const incorrectSet = new Set(progress?.incorrectQuestionIds ?? []);
  let masteredCount = 0;
  let learningCount = 0;
  for (const qid of progress?.answeredQuestionIds ?? []) {
    if (incorrectSet.has(qid)) continue;
    const s = questionStats[qid];
    const acc = s && s.attempts > 0 ? s.correct / s.attempts : 0;
    if (acc >= 0.8) masteredCount++;
    else learningCount++;
  }
  const needsReviewCount = incorrectSet.size;
  const unseenCount = Math.max(0, test.totalQuestions - answered);

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

      {/* Section 29's Question Bank Dashboard — only once there's actually
          something to show; an all-unseen bank has nothing to bucket yet. */}
      {owned && answered > 0 && (
        <div className="mb-6 rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-[0_2px_8px_rgba(15,23,42,0.05)] dark:bg-surface-raised">
          <h2 className="mb-4 text-[15px] font-bold uppercase tracking-wide text-[#155EEF]">Your Question Bank</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <div className="text-2xl font-bold text-[#16A34A]">{masteredCount}</div>
              <div className="text-xs text-[#64748B]">Mastered</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-[#155EEF]">{learningCount}</div>
              <div className="text-xs text-[#64748B]">Learning</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-[#F59E0B]">{needsReviewCount}</div>
              <div className="text-xs text-[#64748B]">Needs Review</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-[#94A3B8]">{unseenCount}</div>
              <div className="text-xs text-[#64748B]">Unseen</div>
            </div>
          </div>
        </div>
      )}

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
            sessionSize={sessionSize}
            onChooseSessionSize={(s) => {
              setSessionSize(s);
              setCustomSize('');
            }}
            customSize={customSize}
            onCustomSizeChange={(v) => {
              setCustomSize(v);
              const n = Number(v);
              if (n > 0) setSessionSize(Math.min(n, MAX_CUSTOM_SESSION_SIZE));
            }}
            feedbackMode={feedbackMode}
            onChooseFeedbackMode={setFeedbackMode}
            unfinishedSession={unfinishedSession ?? null}
            incorrectCount={progress?.incorrectQuestionIds.length ?? 0}
            weakAreasCount={weakAreasCount}
            accuracy={overallAccuracy}
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
interface UnfinishedSession {
  id: string;
  batchSize: number;
  answeredCount: number;
}

function PracticeSetupCard({
  test,
  done,
  answered,
  sessionSize,
  onChooseSessionSize,
  customSize,
  onCustomSizeChange,
  feedbackMode,
  onChooseFeedbackMode,
  unfinishedSession,
  incorrectCount,
  weakAreasCount,
  accuracy,
}: {
  test: { id: string; totalQuestions: number; defaultMinutesPerQuestion?: number };
  done: boolean;
  answered: number;
  sessionSize: number;
  onChooseSessionSize: (size: number) => void;
  customSize: string;
  onCustomSizeChange: (value: string) => void;
  feedbackMode: 'immediate' | 'end_of_session';
  onChooseFeedbackMode: (mode: 'immediate' | 'end_of_session') => void;
  unfinishedSession: UnfinishedSession | null;
  incorrectCount: number;
  weakAreasCount: number;
  accuracy: number;
}) {
  const remainingNew = Math.max(0, test.totalQuestions - answered);
  const percentComplete = test.totalQuestions > 0 ? Math.round((answered / test.totalQuestions) * 100) : 0;
  const minutesPerQuestion = test.defaultMinutesPerQuestion ?? 1.8;
  const estLow = Math.round(sessionSize * minutesPerQuestion * 0.85);
  const estHigh = Math.round(sessionSize * minutesPerQuestion * 1.15);

  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-[0_2px_8px_rgba(15,23,42,0.05)] dark:bg-surface-raised">
      <h2 className="mb-4 text-[15px] font-bold uppercase tracking-wide text-[#155EEF]">Practice Setup</h2>

      {/* Unique coverage — Section 3's "YOUR PROGRESS" bar. Never treats
          answeredCount as anything other than unique questions ever
          submitted (see practiceProgress.answeredQuestionIds), so this
          number can't inflate from repeated Reattempt sessions. */}
      <div className="mb-5">
        <div className="mb-1 flex items-center justify-between text-xs text-[#64748B]">
          <span>
            {answered} / {test.totalQuestions} Practiced
          </span>
          <span>{percentComplete}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-[#F1F5F9]">
          <div className="h-full rounded-full bg-[#155EEF]" style={{ width: `${Math.min(100, percentComplete)}%` }} />
        </div>
        {!done && <div className="mt-1 text-xs text-[#64748B]">{remainingNew} new questions remaining</div>}
      </div>

      {done ? (
        // Section 32 — the "coverage complete" transition to revision, not
        // a silent restart. Every entry point here uses an intentional-
        // repeat session type (isMastery/isWeakAreas/isRevision), so none
        // of this touches unique coverage (already 100% anyway).
        <div className="rounded-lg border border-[#DCE7FF] bg-[#EFF6FF] p-4 text-center">
          <div className="mb-1 text-sm font-bold text-[#0F172A]">🎯 Question Bank Complete</div>
          <p className="mb-3 text-xs text-[#64748B]">
            You've practiced all {test.totalQuestions} questions. Accuracy: {accuracy}%
            {incorrectCount > 0 && ` · ${incorrectCount} question${incorrectCount === 1 ? '' : 's'} to review`}
          </p>
          <div className="flex flex-col gap-2">
            {incorrectCount > 0 && (
              <Link
                to={`/practice-tests/${test.id}/take?mastery=1&feedbackMode=${feedbackMode}`}
                className="block w-full rounded-lg bg-[#155EEF] py-2 text-sm font-semibold text-white hover:bg-[#004EEB]"
              >
                Master My Mistakes
              </Link>
            )}
            {weakAreasCount > 0 && (
              <Link
                to={`/practice-tests/${test.id}/take?weakAreas=1&feedbackMode=${feedbackMode}`}
                className="block w-full rounded-lg border border-[#155EEF] py-2 text-sm font-semibold text-[#155EEF] hover:bg-white"
              >
                Practice Weak Areas
              </Link>
            )}
            <Link
              to={`/practice-tests/${test.id}/take?revision=1&feedbackMode=${feedbackMode}`}
              className="block w-full rounded-lg border border-[#E2E8F0] bg-white py-2 text-sm font-semibold text-[#334155] hover:border-[#155EEF] dark:bg-transparent"
            >
              Start Revision Cycle
            </Link>
          </div>
        </div>
      ) : unfinishedSession ? (
        // Section 10 — an unfinished session is never silently discarded;
        // Resume Practice continues that exact session (startOrResumeBatch
        // returns it as-is), it doesn't start a new one with these pickers.
        <div className="mb-2 rounded-lg border border-[#DCE7FF] bg-[#EFF6FF] p-4">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#155EEF]">Continue Where You Left Off</div>
          <div className="mb-3 text-sm text-[#1E293B]">
            {unfinishedSession.answeredCount} / {unfinishedSession.batchSize} completed ·{' '}
            {unfinishedSession.batchSize - unfinishedSession.answeredCount} question
            {unfinishedSession.batchSize - unfinishedSession.answeredCount === 1 ? '' : 's'} remaining
          </div>
          <Link
            to={`/practice-tests/${test.id}/take`}
            className="block w-full rounded-lg bg-[#155EEF] py-2.5 text-center text-sm font-semibold text-white hover:bg-[#004EEB]"
          >
            Resume Practice →
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-4">
            <label className="mb-2 block text-xs font-medium text-[#64748B]">How much would you like to practice?</label>
            <div className="space-y-2">
              {SESSION_SIZE_PRESETS.map((preset) => (
                <button
                  key={preset.size}
                  type="button"
                  onClick={() => onChooseSessionSize(preset.size)}
                  className={`flex w-full items-center justify-between rounded-lg border px-4 py-2.5 text-left ${
                    sessionSize === preset.size && !customSize
                      ? 'border-[#155EEF] bg-[#EFF6FF]'
                      : 'border-[#E2E8F0] hover:border-[#155EEF]'
                  }`}
                >
                  <span>
                    <span className="block text-sm font-semibold text-[#0F172A]">{preset.size} Questions</span>
                    <span className="block text-xs text-[#64748B]">{preset.label}</span>
                  </span>
                  {'recommended' in preset && preset.recommended && (
                    <span className="rounded-full bg-[#155EEF]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#155EEF]">
                      Recommended
                    </span>
                  )}
                </button>
              ))}
              <div
                className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 ${
                  customSize ? 'border-[#155EEF] bg-[#EFF6FF]' : 'border-[#E2E8F0]'
                }`}
              >
                <span className="text-sm font-semibold text-[#0F172A]">Custom</span>
                <input
                  type="number"
                  min={1}
                  max={Math.min(MAX_CUSTOM_SESSION_SIZE, remainingNew)}
                  value={customSize}
                  onChange={(e) => onCustomSizeChange(e.target.value)}
                  placeholder="e.g. 40"
                  className="w-24 rounded-md border border-[#CBD5E1] bg-white px-2 py-1 text-sm text-[#1E293B] outline-none focus:border-[#155EEF] dark:bg-transparent"
                />
              </div>
            </div>
            <div className="mt-2 text-xs text-[#64748B]">
              {sessionSize} Questions · approximately {estLow}–{estHigh} minutes
            </div>
          </div>

          <div className="mb-5">
            <label className="mb-2 block text-xs font-medium text-[#64748B]">How would you like to practice?</label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => onChooseFeedbackMode('immediate')}
                className={`rounded-lg border p-3 text-left ${
                  feedbackMode === 'immediate' ? 'border-[#155EEF] bg-[#EFF6FF]' : 'border-[#E2E8F0] hover:border-[#155EEF]'
                }`}
              >
                <div className="text-sm font-semibold text-[#0F172A]">⚡ Learn As You Go</div>
                <div className="mt-0.5 text-xs text-[#64748B]">See the answer and explanation after every question.</div>
              </button>
              <button
                type="button"
                onClick={() => onChooseFeedbackMode('end_of_session')}
                className={`rounded-lg border p-3 text-left ${
                  feedbackMode === 'end_of_session' ? 'border-[#155EEF] bg-[#EFF6FF]' : 'border-[#E2E8F0] hover:border-[#155EEF]'
                }`}
              >
                <div className="text-sm font-semibold text-[#0F172A]">📝 Review At End</div>
                <div className="mt-0.5 text-xs text-[#64748B]">See answers after finishing the whole session.</div>
              </button>
            </div>
          </div>

          <Link
            to={`/practice-tests/${test.id}/take?sessionSize=${sessionSize}&feedbackMode=${feedbackMode}`}
            className="block w-full rounded-lg bg-[#155EEF] py-2.5 text-center text-sm font-semibold text-white hover:bg-[#004EEB]"
          >
            Start Practice →
          </Link>
        </>
      )}

      {answered > 0 && !unfinishedSession && (
        <Link
          to={`/practice-tests/${test.id}/take?reattempt=1&feedbackMode=${feedbackMode}`}
          className="mt-2 block w-full rounded-lg border border-[#155EEF] py-2.5 text-center text-sm font-semibold text-[#155EEF] hover:bg-[#EFF6FF]"
        >
          Reattempt Last Session
        </Link>
      )}
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
    countdownLabel = `~${formatShortDate(pacePlan.suggestedExamDate)}`;
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
