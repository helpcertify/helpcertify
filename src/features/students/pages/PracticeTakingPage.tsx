import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getPracticeQuestionsByIds, getPracticeTestById } from '../api/studentContentApi';
import { getStudyPlan } from '../api/studyPlanApi';
import { practiceSessionApi, type BatchReviewQuestion, type PracticeSessionState } from '../api/practiceSessionApi';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { useUiStore } from '@/store/useUiStore';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { VercelApiError } from '@/lib/vercelApi';
import { toDate } from '@/utils/formatDate';
import { computeExamDatePlan, questionsPerDayFromMinutes, buildDailyAnsweredMap, dateKey } from '../lib/studyPlan';
import type { PracticeConfidence, PracticeFeedbackMode, QuestionDoc } from '@/types/models';

interface AnswerFeedback {
  isCorrect: boolean | null;
  correctOptionId: string | null;
  explanation: string | null;
}

const CONFIDENCE_OPTIONS: { value: PracticeConfidence; emoji: string; label: string }[] = [
  { value: 'guessing', emoji: '🤔', label: 'Guessing' },
  { value: 'unsure', emoji: '🙂', label: 'Unsure' },
  { value: 'confident', emoji: '💪', label: 'Confident' },
];

export function PracticeTakingPage() {
  const { testId } = useParams<{ testId: string }>();
  const [searchParams] = useSearchParams();
  const isReattempt = searchParams.get('reattempt') === '1';
  const isMastery = searchParams.get('mastery') === '1';
  const isWeakAreas = searchParams.get('weakAreas') === '1';
  const isRevision = searchParams.get('revision') === '1';
  const sessionSizeParam = searchParams.get('sessionSize');
  const sessionSize = sessionSizeParam ? Number(sessionSizeParam) : undefined;
  const feedbackModeParam = searchParams.get('feedbackMode');
  const requestedFeedbackMode: PracticeFeedbackMode = feedbackModeParam === 'end_of_session' ? 'end_of_session' : 'immediate';
  const navigate = useNavigate();
  const pushToast = useUiStore((s) => s.pushToast);
  const uid = useAuthStore((s) => s.firebaseUser?.uid);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [session, setSession] = useState<PracticeSessionState | null>(null);
  const [questions, setQuestions] = useState<(QuestionDoc & { id: string })[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, AnswerFeedback>>({});
  const [pendingOption, setPendingOption] = useState<Record<string, string>>({});
  const [pendingConfidence, setPendingConfidence] = useState<Record<string, PracticeConfidence>>({});
  const [marked, setMarked] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [streak, setStreak] = useState(0);
  const [sessionXp, setSessionXp] = useState(0);
  const [review, setReview] = useState<{
    questions: BatchReviewQuestion[];
    summary: { totalQuestions: number; answeredCount: number; correctCount: number; incorrectCount: number };
    newPersonalBest: boolean;
    bestStreak: number;
  } | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!testId || startedRef.current) return;
    startedRef.current = true;
    const start = isMastery
      ? practiceSessionApi.startMasteryBatch(testId, requestedFeedbackMode)
      : isWeakAreas
        ? practiceSessionApi.startWeakAreasBatch(testId, requestedFeedbackMode)
        : isRevision
          ? practiceSessionApi.startRevisionCycle(testId, requestedFeedbackMode)
          : isReattempt
            ? practiceSessionApi.reattemptLastBatch(testId, requestedFeedbackMode)
            : practiceSessionApi.startOrResumeBatch(testId, sessionSize, requestedFeedbackMode);
    start
      .then(async (res) => {
        setSessionId(res.sessionId);
        setSession(res.session);
        setStreak(res.session.currentStreak ?? 0);
        const qs = await getPracticeQuestionsByIds(testId, res.session.batchQuestionIds);
        // Preserve the server-assigned batch order rather than Firestore's
        // per-doc fetch order (Promise.all doesn't guarantee it).
        const byId = new Map(qs.map((q) => [q.id, q]));
        setQuestions(res.session.batchQuestionIds.map((id) => byId.get(id)).filter((q): q is QuestionDoc & { id: string } => !!q));
      })
      .catch((err) => {
        pushToast(err instanceof Error ? err.message : 'Could not start this practice session', 'error');
        navigate(err instanceof VercelApiError && err.status === 402 ? '/home/cart' : '/home/practice-tests');
      });
  }, [testId, isReattempt, isMastery, isWeakAreas, isRevision, sessionSize, requestedFeedbackMode, navigate, pushToast]);

  // The server's own record of this session's mode/type is what actually
  // gates the UI, not the query params used to request it — a resumed
  // session keeps whatever it was started with.
  const feedbackMode: PracticeFeedbackMode = session?.feedbackMode ?? 'immediate';
  const isImmediate = feedbackMode === 'immediate';
  const isMasterySession = !!session?.isMastery || !!session?.isWeakAreas || !!session?.isRevision;

  // Today's Target — reuses the exact same Study Plan calculation engine
  // and daily-answered-map pattern as StudyPlanSection.tsx/
  // PracticeTestDetailPage's PlanSummaryCard, just computed here so it can
  // be shown live during the session (Section 26). Only fetched for a
  // normal session — none of the intentional-repeat modes contribute new
  // coverage, so the daily target doesn't apply to them.
  const trackingDailyTarget = !isReattempt && !isMastery && !isWeakAreas && !isRevision;
  const { data: test } = useQuery({
    queryKey: ['student', 'practiceTest', testId],
    queryFn: () => getPracticeTestById(testId!),
    enabled: !!testId && trackingDailyTarget,
  });
  const { data: existingPlan } = useQuery({
    queryKey: ['student', 'studyPlan', uid, testId],
    queryFn: () => getStudyPlan(uid!, testId!),
    enabled: !!uid && !!testId && trackingDailyTarget,
  });
  const { data: uniqueAnsweredCount } = useQuery({
    queryKey: ['student', 'myPracticeProgressCount', uid, testId],
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'practiceProgress', `${uid}_${testId}`));
      return snap.exists() ? ((snap.data().answeredQuestionIds as string[] | undefined)?.length ?? 0) : 0;
    },
    enabled: !!uid && !!testId && trackingDailyTarget,
  });
  const { data: dailyAnsweredMap } = useQuery({
    queryKey: ['student', 'streakSessions', uid, testId],
    queryFn: async () => {
      const snap = await getDocs(
        query(
          collection(db, 'practiceSessions'),
          where('userId', '==', uid),
          where('testId', '==', testId),
          where('isReattempt', '==', false)
        )
      );
      const sessions = snap.docs
        .map((d) => d.data())
        .filter((d) => !d.isMastery)
        .map((d) => ({ startedAt: toDate(d.startedAt), answeredCount: (d.answeredCount as number) ?? 0 }));
      return buildDailyAnsweredMap(sessions);
    },
    enabled: !!uid && !!testId && trackingDailyTarget && !!existingPlan,
  });

  const dailyTarget = useMemo(() => {
    if (!trackingDailyTarget || !existingPlan || !test) return 0;
    const totalQuestions = test.totalQuestions ?? 0;
    const minutesPerQuestion = test.defaultMinutesPerQuestion ?? 1.8;
    const answered = uniqueAnsweredCount ?? 0;
    const today = new Date();
    if (existingPlan.planningMode === 'examDate' && existingPlan.targetExamDate) {
      return computeExamDatePlan({
        today,
        targetExamDate: toDate(existingPlan.targetExamDate),
        totalQuestions,
        uniqueAnsweredCount: answered,
        studyDays: existingPlan.studyDays,
        revisionBufferDays: existingPlan.revisionBufferDays,
        minutesPerQuestion,
      }).dailyTarget;
    }
    return existingPlan.paceQuestionsPerDay ?? questionsPerDayFromMinutes(existingPlan.paceMinutesPerDay ?? 0, minutesPerQuestion);
  }, [trackingDailyTarget, existingPlan, test, uniqueAnsweredCount]);

  const [answeredToday, setAnsweredToday] = useState<number | null>(null);
  useEffect(() => {
    if (dailyAnsweredMap && answeredToday === null) {
      setAnsweredToday(dailyAnsweredMap[dateKey(new Date())] ?? 0);
    }
  }, [dailyAnsweredMap, answeredToday]);

  // Award the one-time daily-target-complete bonus (Section 26) the moment
  // this session's own answers push today's count to the target — reuses
  // the existing write-once recordMilestone action (see api/practice-
  // session.ts), so a duplicate call here (e.g. answering further past the
  // target) is a harmless no-op, not a double award.
  useEffect(() => {
    if (dailyTarget > 0 && answeredToday !== null && answeredToday >= dailyTarget && testId) {
      practiceSessionApi.recordMilestone(testId, `dailyTargetBonus_${dateKey(new Date())}`).catch(() => {});
    }
  }, [answeredToday, dailyTarget, testId]);

  const current = questions[currentIndex];
  const answeredCount = useMemo(() => Object.keys(answers).length, [answers]);
  const markedCount = useMemo(() => Object.values(marked).filter(Boolean).length, [marked]);

  const selectOption = (optionId: string) => {
    if (!current || answers[current.id]) return;
    setPendingOption((prev) => ({ ...prev, [current.id]: optionId }));
  };
  const selectConfidence = (value: PracticeConfidence) => {
    if (!current) return;
    setPendingConfidence((prev) => ({ ...prev, [current.id]: value }));
  };

  // Grading a practice answer is a real network round-trip (the answer key
  // lives server-side, on purpose — it's never shipped to the client up
  // front). `saving` blocks the Submit button and every option until the
  // result is back, so fast taps can't outrun the response.
  const submitAnswer = async () => {
    const optionId = current && pendingOption[current.id];
    if (!sessionId || !current || !optionId || saving) return;
    setSaving(true);
    try {
      const res = await practiceSessionApi.saveAnswer(sessionId, current.id, optionId, pendingConfidence[current.id]);
      setAnswers((prev) => ({ ...prev, [current.id]: optionId }));
      setFeedback((prev) => ({
        ...prev,
        [current.id]: { isCorrect: res.isCorrect, correctOptionId: res.correctOptionId, explanation: res.explanation },
      }));
      setStreak(res.streak);
      setSessionXp((xp) => xp + res.xpAwarded);
      if (trackingDailyTarget) setAnsweredToday((prev) => (prev ?? 0) + 1);
    } catch {
      pushToast('Could not save that answer', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleMark = (id: string) => setMarked((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleFinish = async () => {
    if (!sessionId) return;
    try {
      const { newPersonalBest, bestStreak } = await practiceSessionApi.submitBatch(sessionId);
      const data = await practiceSessionApi.getBatchReview(sessionId);
      setReview({ ...data, newPersonalBest, bestStreak });
    } catch {
      pushToast('Could not submit this session', 'error');
    }
  };

  const unansweredCount = questions.length - answeredCount;

  // Finish is available from any question in the session, not just the
  // last one — clicking it with questions still unanswered confirms first
  // (with the actual count) rather than finishing immediately.
  const handleFinishClick = () => {
    if (unansweredCount > 0) {
      setShowFinishConfirm(true);
    } else {
      handleFinish();
    }
  };

  if (review) {
    return (
      <PracticeReviewScreen
        review={review}
        sessionXp={sessionXp}
        onDone={() => navigate('/home/practice-tests')}
        onMasterMistakes={() => navigate(`/practice-tests/${testId}/take?mastery=1&feedbackMode=${feedbackMode}`)}
      />
    );
  }

  if (!session || !current) return <div className="p-8 text-ink-faint">Loading practice session…</div>;

  const result = feedback[current.id];
  // Only 'immediate' mode ever has a non-null isCorrect — 'end_of_session'
  // always gets isCorrect: null back from saveAnswer, so this can never
  // accidentally reveal correctness in that mode even if `result` exists.
  const revealed = isImmediate && !!result && result.isCorrect !== null;
  const selectedOptionId = answers[current.id] ?? pendingOption[current.id];
  const isSubmittedForCurrent = !!answers[current.id];
  const percentThroughSession = questions.length > 0 ? Math.round(((currentIndex + 1) / questions.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-surface px-4 py-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-1 flex items-center justify-between">
          <h1 className="text-lg font-bold text-ink">
            {session?.isMastery
              ? 'Master My Mistakes'
              : session?.isWeakAreas
                ? 'Practice Weak Areas'
                : session?.isRevision
                  ? 'Revision Cycle'
                  : 'Practice Session'}
            {isReattempt && !isMasterySession && <span className="ml-2 text-sm text-ink-faint">(Reattempt)</span>}
          </h1>
          <div className="flex items-center gap-3 text-sm text-ink-faint">
            {markedCount > 0 && <span className="text-[#F59E0B]">🚩 {markedCount} marked</span>}
            <span>
              {answeredCount} / {questions.length} answered
            </span>
          </div>
        </div>
        <div className="mb-2 flex items-center justify-between text-xs text-[#64748B]">
          <span>
            Question {currentIndex + 1} of {questions.length}
          </span>
          {/* Streak only ever shown once >= 2 (Section 24), and only in
              Learn As You Go while the session is still running — Review At
              End never reveals anything correctness-adjacent mid-session. */}
          {isImmediate && streak >= 2 && <span className="font-semibold text-[#F59E0B]">🔥 {streak} Streak</span>}
        </div>
        <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-[#F1F5F9]">
          <div className="h-full rounded-full bg-[#155EEF]" style={{ width: `${percentThroughSession}%` }} />
        </div>

        {/* Right-side panel: question navigator + (Learn As You Go only)
            the Today's Goal / Streak / Session XP momentum stats. Marked-
            for-review questions get an amber ring + flag so they're easy
            to spot and jump back to. */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_260px]">
          <div className="order-2 lg:order-1">
            <div className="rounded-xl border border-surface-border bg-surface-raised p-6">
              <h2 className="mb-4 font-medium text-ink">
                Q{currentIndex + 1}. {current.questionText}
              </h2>
              <div className="space-y-2">
                {current.options.map((opt) => {
                  const selected = selectedOptionId === opt.id;
                  const isTheCorrectOption = revealed && result.correctOptionId === opt.id;
                  const isWrongPick = revealed && selected && !result.isCorrect;

                  let cls = 'border-surface-border text-ink-muted hover:border-neutral-600';
                  if (revealed) {
                    if (isTheCorrectOption) cls = 'border-[#16A34A] bg-[#F0FDF4] text-[#16A34A]';
                    else if (isWrongPick) cls = 'border-[#DC2626] bg-[#FEF2F2] text-[#DC2626]';
                    else cls = 'border-surface-border text-ink-faint opacity-60';
                  } else if (selected) {
                    cls = 'border-[#155EEF] bg-[#EFF6FF] text-[#155EEF]';
                  }

                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={saving || isSubmittedForCurrent}
                      onClick={() => selectOption(opt.id)}
                      className={`flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left text-sm disabled:cursor-not-allowed ${cls}`}
                    >
                      <span>{opt.text}</span>
                      {isTheCorrectOption && <span className="shrink-0 text-xs font-semibold">✓</span>}
                      {isWrongPick && <span className="shrink-0 text-xs font-semibold">✕</span>}
                    </button>
                  );
                })}
              </div>

              {/* Confidence — optional, shown once an option is picked but
                  before submitting; never affects grading (Section 16). */}
              {!isSubmittedForCurrent && selectedOptionId && (
                <div className="mt-4">
                  <label className="mb-2 block text-xs font-medium text-[#64748B]">How confident are you?</label>
                  <div className="flex gap-2">
                    {CONFIDENCE_OPTIONS.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => selectConfidence(c.value)}
                        className={`rounded-lg border px-3 py-1.5 text-sm ${
                          pendingConfidence[current.id] === c.value
                            ? 'border-[#155EEF] bg-[#EFF6FF] text-[#155EEF]'
                            : 'border-surface-border text-ink-muted hover:border-neutral-600'
                        }`}
                      >
                        {c.emoji} {c.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={submitAnswer}
                    className="mt-3 w-full rounded-lg bg-[#155EEF] py-2.5 text-sm font-semibold text-white hover:bg-[#004EEB] disabled:opacity-60"
                  >
                    {saving ? 'Checking…' : 'Submit Answer'}
                  </button>
                </div>
              )}

              {/* Learn As You Go: correctness + explanation, right away —
                  Section 17-19's hierarchy (correct/your-answer callouts,
                  then the admin-authored explanation, exactly as stored;
                  no fabricated "why your answer is wrong"/"exam tip"
                  sub-sections, since the schema only has one explanation
                  field per question). Review At End: never shown — result
                  is always undefined-equivalent there (isCorrect is null),
                  so `revealed` is false and none of this renders. */}
              {revealed && (
                <div className="mt-4 space-y-3">
                  {result.isCorrect ? (
                    <div className="rounded-lg border border-[#16A34A] bg-[#F0FDF4] px-4 py-3">
                      <div className="flex items-center gap-2 text-sm font-bold text-[#16A34A]">✓ Correct</div>
                    </div>
                  ) : (
                    <>
                      <div className="rounded-lg border border-[#DC2626] bg-[#FEF2F2] px-4 py-3">
                        <div className="text-xs font-bold uppercase tracking-wide text-[#DC2626]">✕ Your Answer</div>
                        <div className="mt-1 text-sm text-[#1E293B]">
                          {current.options.find((o) => o.id === answers[current.id])?.text}
                        </div>
                      </div>
                      <div className="rounded-lg border border-[#16A34A] bg-[#F0FDF4] px-4 py-3">
                        <div className="text-xs font-bold uppercase tracking-wide text-[#16A34A]">✓ Correct Answer</div>
                        <div className="mt-1 text-sm text-[#1E293B]">
                          {current.options.find((o) => o.id === result.correctOptionId)?.text}
                        </div>
                      </div>
                    </>
                  )}
                  {result.explanation && (
                    <div className="rounded-lg border border-surface-border bg-surface p-4">
                      <div className="mb-1 text-xs font-bold uppercase tracking-wide text-[#155EEF]">Explanation</div>
                      <p className="whitespace-pre-line text-sm text-[#1E293B]">{result.explanation}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Review At End: no correctness of any kind, just a neutral
                  confirmation that the answer was saved. */}
              {!isImmediate && isSubmittedForCurrent && (
                <div className="mt-3 rounded-lg bg-[#F8FAFC] px-4 py-2 text-sm text-[#64748B]">Answer saved.</div>
              )}
            </div>

            {/* Previous/Next stay together as one tight row for fast
                navigation. Mark for Review moved out of the question header
                (it was squeezing question text into a narrow column) down
                next to Finish Session — both are "side" actions, separate
                from the Previous/Next pair a thumb reaches for most often.
                In Learn As You Go, Next only appears once the current
                question's result is back — Section 20: the learner should
                have time to read the explanation before moving on, not be
                swept forward automatically. */}
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={currentIndex === 0}
                  onClick={() => setCurrentIndex((i) => i - 1)}
                  className="rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted disabled:opacity-40"
                >
                  ← Previous
                </button>
                {currentIndex < questions.length - 1 && (!isImmediate || isSubmittedForCurrent) && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setCurrentIndex((i) => i + 1)}
                    className="rounded-lg bg-[#155EEF] px-4 py-2 text-sm font-medium text-white hover:bg-[#004EEB] disabled:opacity-60"
                  >
                    Next Question →
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => toggleMark(current.id)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    marked[current.id]
                      ? 'border-[#F59E0B] bg-[#F59E0B]/10 text-[#F59E0B]'
                      : 'border-surface-border text-ink-faint hover:border-neutral-600'
                  }`}
                >
                  🚩 {marked[current.id] ? 'Marked' : 'Mark for Review'}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleFinishClick}
                  className="rounded-lg bg-[#155EEF] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#004EEB] disabled:opacity-60"
                >
                  Finish Session
                </button>
              </div>
            </div>
          </div>

          <div className="order-1 flex flex-col gap-4 lg:order-2">
            {isImmediate && trackingDailyTarget && dailyTarget > 0 && (
              <div className="rounded-lg border border-surface-border bg-surface-raised p-4 lg:sticky lg:top-6">
                <div className="mb-3 text-xs font-bold uppercase tracking-wide text-[#155EEF]">Session</div>
                <div className="mb-3">
                  <div className="text-xs text-[#64748B]">🎯 Today's Goal</div>
                  <div className="text-lg font-bold text-[#0F172A]">
                    {answeredToday ?? 0} / {dailyTarget}
                  </div>
                </div>
                <div className="mb-3">
                  <div className="text-xs text-[#64748B]">🔥 Current Streak</div>
                  <div className="text-lg font-bold text-[#0F172A]">{streak}</div>
                </div>
                <div>
                  <div className="text-xs text-[#64748B]">⚡ Session XP</div>
                  <div className="text-lg font-bold text-[#0F172A]">{sessionXp}</div>
                </div>
              </div>
            )}
            <div className="rounded-lg border border-surface-border p-3 lg:sticky lg:top-6">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                Questions ({answeredCount}/{questions.length} answered)
              </div>
              <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto lg:max-h-[calc(100vh-8rem)]">
                {questions.map((q, i) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCurrentIndex(i)}
                    className={`relative h-8 w-8 shrink-0 rounded text-xs font-medium ${
                      i === currentIndex
                        ? 'bg-[#155EEF] text-white'
                        : answers[q.id]
                          ? 'bg-[#155EEF]/20 text-[#155EEF]'
                          : 'bg-white/5 text-ink-faint'
                    } ${marked[q.id] ? 'ring-2 ring-[#F59E0B]' : ''}`}
                  >
                    {i + 1}
                    {marked[q.id] && <span className="absolute -right-1 -top-1 text-[10px] leading-none">🚩</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={showFinishConfirm}
        title="Finish this session now?"
        message={`You still have ${unansweredCount} question${unansweredCount === 1 ? '' : 's'} unanswered in this session. Once you finish, you won't be able to come back and answer them here. You can always start a new session for the rest. Finish anyway?`}
        confirmLabel="Finish anyway"
        cancelLabel="Keep working"
        onConfirm={() => {
          setShowFinishConfirm(false);
          handleFinish();
        }}
        onCancel={() => setShowFinishConfirm(false)}
      />
    </div>
  );
}

type ReviewFilter = 'all' | 'correct' | 'incorrect';

// Section 22/23 — shown after Finish Session in either feedback mode. This
// is the only place a Review At End session's answers/explanations are
// ever revealed (see getBatchReview's own in_progress guard server-side).
function PracticeReviewScreen({
  review,
  sessionXp,
  onDone,
  onMasterMistakes,
}: {
  review: {
    questions: BatchReviewQuestion[];
    summary: { totalQuestions: number; answeredCount: number; correctCount: number; incorrectCount: number };
    newPersonalBest: boolean;
    bestStreak: number;
  };
  sessionXp: number;
  onDone: () => void;
  onMasterMistakes: () => void;
}) {
  const [filter, setFilter] = useState<ReviewFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(review.questions[0]?.questionId ?? null);

  const accuracy = review.summary.answeredCount > 0 ? Math.round((review.summary.correctCount / review.summary.answeredCount) * 100) : 0;
  const filtered = review.questions.filter((q) => {
    if (filter === 'correct') return q.isCorrect;
    if (filter === 'incorrect') return q.selectedOptionId !== null && !q.isCorrect;
    return true;
  });
  const selected = review.questions.find((q) => q.questionId === selectedId) ?? null;

  return (
    <div className="min-h-screen bg-surface px-4 py-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 rounded-xl border border-[#E2E8F0] bg-white p-6 text-center shadow-[0_2px_8px_rgba(15,23,42,0.05)] dark:bg-surface-raised">
          <h1 className="mb-1 text-[22px] font-bold text-[#0F172A]">Practice Complete</h1>
          <p className="mb-4 text-sm text-[#64748B]">{review.summary.totalQuestions} Questions</p>
          <div className="mx-auto grid max-w-md grid-cols-3 gap-4">
            <div>
              <div className="text-2xl font-bold text-[#16A34A]">{review.summary.correctCount}</div>
              <div className="text-xs text-[#64748B]">Correct</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-[#DC2626]">{review.summary.incorrectCount}</div>
              <div className="text-xs text-[#64748B]">Incorrect</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-[#155EEF]">{accuracy}%</div>
              <div className="text-xs text-[#64748B]">Accuracy</div>
            </div>
          </div>

          {(review.bestStreak >= 2 || sessionXp > 0) && (
            <div className="mx-auto mt-5 grid max-w-md grid-cols-2 gap-4 border-t border-[#E2E8F0] pt-4">
              {review.bestStreak >= 2 && (
                <div>
                  <div className="text-lg font-bold text-[#F59E0B]">
                    {review.newPersonalBest ? `🏆 New Best: ${review.bestStreak}!` : `🔥 ${review.bestStreak}`}
                  </div>
                  <div className="text-xs text-[#64748B]">Best Streak</div>
                </div>
              )}
              {sessionXp > 0 && (
                <div>
                  <div className="text-lg font-bold text-[#155EEF]">⚡ {sessionXp}</div>
                  <div className="text-xs text-[#64748B]">Session XP</div>
                </div>
              )}
            </div>
          )}
        </div>

        {review.summary.incorrectCount > 0 && (
          <div className="mb-6 rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-[0_2px_8px_rgba(15,23,42,0.05)] dark:bg-surface-raised">
            <div className="mb-1 text-sm font-bold text-[#0F172A]">
              {review.summary.incorrectCount} Question{review.summary.incorrectCount === 1 ? '' : 's'} to Master
            </div>
            <p className="mb-3 text-sm text-[#64748B]">These are the questions you missed.</p>
            <button
              type="button"
              onClick={onMasterMistakes}
              className="rounded-lg bg-[#155EEF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#004EEB]"
            >
              Master My Mistakes →
            </button>
          </div>
        )}

        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[15px] font-bold uppercase tracking-wide text-[#155EEF]">Answer Review</h2>
          <div className="flex gap-1">
            {(['all', 'correct', 'incorrect'] as ReviewFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium capitalize ${
                  filter === f ? 'border-[#155EEF] bg-[#EFF6FF] text-[#155EEF]' : 'border-surface-border text-ink-muted'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
          <div className="rounded-lg border border-surface-border p-3">
            <div className="flex flex-wrap gap-2">
              {filtered.map((q) => {
                const idx = review.questions.findIndex((x) => x.questionId === q.questionId);
                return (
                  <button
                    key={q.questionId}
                    type="button"
                    onClick={() => setSelectedId(q.questionId)}
                    className={`flex h-9 w-9 items-center justify-center rounded text-xs font-semibold ${
                      selectedId === q.questionId
                        ? 'bg-[#155EEF] text-white'
                        : q.isCorrect
                          ? 'bg-[#F0FDF4] text-[#16A34A]'
                          : q.selectedOptionId
                            ? 'bg-[#FEF2F2] text-[#DC2626]'
                            : 'bg-surface-raised text-ink-faint'
                    }`}
                  >
                    {idx + 1} {q.isCorrect ? '✓' : q.selectedOptionId ? '✕' : ''}
                  </button>
                );
              })}
            </div>
          </div>

          {selected && (
            <div className="rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-[0_2px_8px_rgba(15,23,42,0.05)] dark:bg-surface-raised">
              <div className="mb-1 text-xs font-bold uppercase tracking-wide text-[#64748B]">
                Question {review.questions.findIndex((x) => x.questionId === selected.questionId) + 1}
              </div>
              <p className="mb-4 text-sm font-medium text-[#1E293B]">{selected.questionText}</p>

              {!selected.isCorrect && selected.selectedOptionId && (
                <div className="mb-3 rounded-lg border border-[#DC2626] bg-[#FEF2F2] px-4 py-3">
                  <div className="text-xs font-bold uppercase tracking-wide text-[#DC2626]">✕ Your Answer</div>
                  <div className="mt-1 text-sm text-[#1E293B]">
                    {selected.options.find((o) => o.id === selected.selectedOptionId)?.text}
                  </div>
                </div>
              )}
              <div className="mb-3 rounded-lg border border-[#16A34A] bg-[#F0FDF4] px-4 py-3">
                <div className="text-xs font-bold uppercase tracking-wide text-[#16A34A]">✓ Correct Answer</div>
                <div className="mt-1 text-sm text-[#1E293B]">
                  {selected.options.find((o) => o.id === selected.correctOptionId)?.text}
                </div>
              </div>
              {selected.explanation && (
                <div className="rounded-lg border border-surface-border bg-surface p-4">
                  <div className="mb-1 text-xs font-bold uppercase tracking-wide text-[#155EEF]">Explanation</div>
                  <p className="whitespace-pre-line text-sm text-[#1E293B]">{selected.explanation}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onDone}
          className="mt-6 w-full rounded-lg bg-[#155EEF] py-2.5 text-sm font-semibold text-white hover:bg-[#004EEB]"
        >
          Finish Session
        </button>
      </div>
    </div>
  );
}
