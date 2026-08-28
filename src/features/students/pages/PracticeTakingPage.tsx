import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
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
import type { PracticeFeedbackMode, QuestionDoc } from '@/types/models';

interface AnswerFeedback {
  isCorrect: boolean | null;
  correctOptionId: string | null;
  explanation: string | null;
}

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

// A generic, non-question-specific reminder — not fabricated per-question
// content. AnswerKeyDoc has one explanation string, not separate why-
// correct/why-wrong/exam-tip fields, so this is the same static line every
// time, distinct from the real admin-authored explanation above it.
const EXAM_TIP = 'Eliminate the options that are only partially related, and choose the one that most directly addresses what the question is actually asking.';

// Practice Session — the Practice Momentum experience, visually matched to
// the supplied reference (two-column shell: dominant question column +
// 360px sidebar). Mock Exam's own taking page (QuizTakingPage.tsx) is a
// separate file and is untouched — none of Practice Momentum (streak, XP,
// Today's Goal, immediate feedback/explanations) belongs there.
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
  const [marked, setMarked] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);
  const [streak, setStreak] = useState(0);
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
  const isIntentionalRepeat = !!session?.isMastery || !!session?.isWeakAreas || !!session?.isRevision;

  // The practice test's own title/estimate — needed for the header
  // regardless of session type (unlike Today's Target below, which only
  // applies to a normal, new-coverage session).
  const { data: test } = useQuery({
    queryKey: ['student', 'practiceTest', testId],
    queryFn: () => getPracticeTestById(testId!),
    enabled: !!testId,
  });

  // Today's Target — reuses the exact same Study Plan calculation engine
  // and daily-answered-map pattern as StudyPlanSection.tsx/
  // PracticeTestDetailPage's PlanSummaryCard, just computed here so it can
  // be shown live during the session (Section 26). Only fetched for a
  // normal session — none of the intentional-repeat modes contribute new
  // coverage, so the daily target doesn't apply to them.
  const trackingDailyTarget = !isReattempt && !isIntentionalRepeat;
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
        .filter((d) => !d.isMastery && !d.isWeakAreas && !d.isRevision)
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

  const selectOption = (optionId: string) => {
    if (!current || answers[current.id]) return;
    setPendingOption((prev) => ({ ...prev, [current.id]: optionId }));
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
      const res = await practiceSessionApi.saveAnswer(sessionId, current.id, optionId);
      setAnswers((prev) => ({ ...prev, [current.id]: optionId }));
      setFeedback((prev) => ({
        ...prev,
        [current.id]: { isCorrect: res.isCorrect, correctOptionId: res.correctOptionId, explanation: res.explanation },
      }));
      setStreak(res.streak);
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
  const isLastQuestion = currentIndex === questions.length - 1;

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

  // Next Question is always available — a question is never a hard gate
  // on moving forward, whether or not it's been submitted. Submit Answer
  // (below) is the only place an unanswered question needs a confirmation,
  // since that's an explicit "I'm choosing to skip this" action rather
  // than just browsing past it.
  const goToNextOrFinish = () => {
    if (isLastQuestion) handleFinishClick();
    else setCurrentIndex((i) => i + 1);
  };

  const handleSubmitClick = () => {
    if (!current) return;
    if (pendingOption[current.id]) {
      submitAnswer();
    } else {
      setShowSkipConfirm(true);
    }
  };

  if (review) {
    return (
      <PracticeReviewScreen review={review} onDone={() => navigate('/home/practice-tests')} />
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
  const percentComplete = questions.length > 0 ? Math.round(((currentIndex + 1) / questions.length) * 100) : 0;

  const sessionTitle = session.isMastery
    ? 'Master My Mistakes'
    : session.isWeakAreas
      ? 'Practice Weak Areas'
      : session.isRevision
        ? 'Revision Cycle'
        : test?.title ?? 'Practice Test';

  return (
    <div className="min-h-screen bg-surface px-4 py-5 sm:px-6">
      <div className="mx-auto w-full max-w-[1500px]">
        {/* Session header — title/mode pill (left), question count + progress
            (center), End Session (right). */}
        <div className="mb-5 flex flex-col gap-4 rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-[0_2px_8px_rgba(15,23,42,0.04)] dark:bg-surface-raised sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 shrink-0">
            <div className="truncate text-base font-bold text-[#0F172A]">📖 {sessionTitle}</div>
            <span
              className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                isImmediate ? 'bg-[#EFF6FF] text-[#155EEF]' : 'bg-[#F8FAFC] text-[#64748B]'
              }`}
            >
              {isImmediate ? '⚡ Learn As You Go' : '📝 Review At The End'}
            </span>
          </div>

          <div className="flex-1 sm:max-w-md">
            <div className="mb-1.5 text-center text-sm font-semibold text-[#0F172A]">
              Question {currentIndex + 1} of {questions.length}
            </div>
            <div className="flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#F1F5F9]">
                <div className="h-full rounded-full bg-[#155EEF]" style={{ width: `${percentComplete}%` }} />
              </div>
              <span className="shrink-0 text-xs text-[#64748B]">{percentComplete}% Complete</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowEndConfirm(true)}
            className="shrink-0 self-start rounded-lg border border-[#E2E8F0] px-4 py-2 text-sm font-semibold text-[#DC2626] hover:border-[#FCA5A5] sm:self-auto"
          >
            ⏻ End Session
          </button>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* Left column — question, answers, explanation, bottom nav. */}
          <div>
            <div className="rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-[0_2px_8px_rgba(15,23,42,0.04)] dark:bg-surface-raised">
              <h2 className="mb-4 text-lg font-semibold leading-relaxed text-[#0F172A]">
                <span className="font-bold text-[#155EEF]">Q{currentIndex + 1}.</span> {current.questionText}
              </h2>

              <div className="space-y-2.5">
                {current.options.map((opt, i) => {
                  const selected = selectedOptionId === opt.id;
                  const isTheCorrectOption = revealed && result.correctOptionId === opt.id;
                  const isWrongPick = revealed && selected && !result.isCorrect;
                  const isCorrectAndYours = isTheCorrectOption && selected;

                  let cls = 'border-[#E2E8F0] bg-white text-[#1E293B] hover:border-[#CBD5E1] dark:bg-transparent';
                  if (isWrongPick) cls = 'border-[#FCA5A5] bg-[#FEF2F2] text-[#1E293B]';
                  else if (isTheCorrectOption) cls = 'border-[#86EFAC] bg-[#F0FDF4] text-[#1E293B]';
                  else if (revealed) cls = 'border-[#E2E8F0] bg-white text-[#94A3B8] opacity-70 dark:bg-transparent';
                  else if (selected) cls = 'border-[#155EEF] bg-[#EFF6FF] text-[#0F172A]';

                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={saving || isSubmittedForCurrent}
                      onClick={() => selectOption(opt.id)}
                      className={`flex w-full min-h-[58px] items-center gap-3 rounded-lg border px-4 py-3 text-left disabled:cursor-not-allowed ${cls}`}
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sm font-bold ${
                          isWrongPick
                            ? 'bg-[#DC2626]/10 text-[#DC2626]'
                            : isTheCorrectOption
                              ? 'bg-[#16A34A]/10 text-[#16A34A]'
                              : selected
                                ? 'bg-[#155EEF]/10 text-[#155EEF]'
                                : 'bg-[#F1F5F9] text-[#64748B]'
                        }`}
                      >
                        {OPTION_LETTERS[i] ?? i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-medium">{opt.text}</span>
                        {isWrongPick && <span className="mt-0.5 block text-xs font-semibold text-[#DC2626]">● Your answer</span>}
                        {isCorrectAndYours && (
                          <span className="mt-0.5 block text-xs font-semibold text-[#16A34A]">● Correct · Your answer</span>
                        )}
                        {isTheCorrectOption && !selected && (
                          <span className="mt-0.5 block text-xs font-semibold text-[#16A34A]">● Correct answer</span>
                        )}
                      </span>
                      {revealed ? (
                        (isWrongPick || isTheCorrectOption) && (
                          <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                              isWrongPick ? 'bg-[#DC2626]' : 'bg-[#16A34A]'
                            }`}
                          >
                            {isWrongPick ? '✕' : '✓'}
                          </span>
                        )
                      ) : (
                        <span
                          className={`h-4 w-4 shrink-0 rounded-full border-2 ${
                            selected ? 'border-[#155EEF] bg-[#155EEF]' : 'border-[#CBD5E1]'
                          }`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Always visible while unanswered, whether or not an option
                  is picked yet — clicking it with nothing selected warns
                  first rather than silently doing nothing (see
                  showSkipConfirm below). */}
              {!isSubmittedForCurrent && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSubmitClick}
                  className="mt-4 w-full rounded-lg bg-[#155EEF] py-2.5 text-sm font-semibold text-white hover:bg-[#004EEB] disabled:opacity-60"
                >
                  {saving ? 'Checking…' : 'Submit Answer'}
                </button>
              )}

              {/* Learn As You Go: one unified explanation panel, not
                  separate boxes — the answer choices above already show
                  what was selected vs correct. Only one explanation string
                  exists per question (AnswerKeyDoc.explanation), so this
                  shows that single admin-authored text under "Why this is
                  correct"; the Exam Tip below it is a static, non-question-
                  specific reminder, not fabricated per-question content
                  (there's no such field in the schema). Review At End:
                  never shown — result is always undefined-equivalent there
                  (isCorrect is null), so `revealed` is false and none of
                  this renders. */}
              {revealed && result.explanation && (
                <div className="mt-5 rounded-lg border border-[#E2E8F0] bg-[#F0FDF4] p-4">
                  <div className="mb-1.5 flex items-center gap-1.5 text-sm font-bold text-[#16A34A]">✓ Why this is correct</div>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-[#1E293B]">{result.explanation}</p>
                  <div className="my-3 border-t border-dashed border-[#BBF7D0]" />
                  <div className="mb-1.5 flex items-center gap-1.5 text-sm font-bold text-[#0F172A]">💡 Exam Tip</div>
                  <p className="text-sm leading-relaxed text-[#1E293B]">{EXAM_TIP}</p>
                </div>
              )}

              {/* Review At End: no correctness of any kind, just a neutral
                  confirmation that the answer was saved. */}
              {!isImmediate && isSubmittedForCurrent && (
                <div className="mt-3 rounded-lg bg-[#F8FAFC] px-4 py-2 text-sm text-[#64748B]">Answer saved.</div>
              )}
            </div>

            {/* Bottom navigation — one static row, always in the same
                three positions regardless of session state: Previous /
                Mark for Review / Next Question (the only strong primary
                CTA, becoming Finish Practice on the last question). Never
                hidden or reflowed based on whether the current question has
                been answered — an unanswered question is never a hard gate
                on moving forward. Finish Session lives in the sidebar
                instead of competing with Next. */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex((i) => i - 1)}
                className="rounded-lg border border-[#E2E8F0] px-4 py-2.5 text-sm font-semibold text-[#334155] disabled:opacity-40"
              >
                ← Previous
              </button>
              <button
                type="button"
                onClick={() => toggleMark(current.id)}
                className={`rounded-lg border px-4 py-2.5 text-sm font-semibold ${
                  marked[current.id] ? 'border-[#F59E0B] bg-[#F59E0B]/10 text-[#F59E0B]' : 'border-[#E2E8F0] text-[#64748B] hover:border-[#CBD5E1]'
                }`}
              >
                🚩 {marked[current.id] ? 'Marked' : 'Mark for Review'}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={goToNextOrFinish}
                className="rounded-lg bg-[#155EEF] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#004EEB] disabled:opacity-60"
              >
                {isLastQuestion ? 'Finish Practice →' : 'Next Question →'}
              </button>
            </div>
          </div>

          {/* Right sidebar — Your Progress (Today's Goal), Practice
              Momentum, Questions navigator, Finish Session. Practice
              Momentum only shown in Learn As You Go (Section 24/26): a
              Review At End session reveals no streak/XP truth mid-session,
              same as the question/answer/explanation area. */}
          <div className="flex flex-col gap-4">
            {isImmediate && (
              <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-[0_2px_8px_rgba(15,23,42,0.04)] dark:bg-surface-raised lg:sticky lg:top-5">
                <div className="mb-3 text-xs font-bold uppercase tracking-wide text-[#155EEF]">Your Progress</div>
                <div className="mb-1 text-xs font-semibold text-[#64748B]">🎯 Today's Goal</div>
                {trackingDailyTarget && dailyTarget > 0 ? (
                  <>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-sm font-semibold text-[#0F172A]">
                        {answeredToday ?? 0} / {dailyTarget} Questions
                      </span>
                      <span className="text-sm font-semibold text-[#0F172A]">
                        {Math.min(100, Math.round(((answeredToday ?? 0) / dailyTarget) * 100))}%
                      </span>
                    </div>
                    <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-[#F1F5F9]">
                      <div
                        className="h-full rounded-full bg-[#155EEF]"
                        style={{ width: `${Math.min(100, Math.round(((answeredToday ?? 0) / dailyTarget) * 100))}%` }}
                      />
                    </div>
                    <div className="text-xs text-[#64748B]">
                      {(answeredToday ?? 0) >= dailyTarget
                        ? "You're on track for your exam."
                        : `${dailyTarget - (answeredToday ?? 0)} more question${dailyTarget - (answeredToday ?? 0) === 1 ? '' : 's'} to stay on track`}
                    </div>
                  </>
                ) : trackingDailyTarget && test ? (
                  <>
                    <p className="mb-3 text-xs text-[#64748B]">Set a study goal to get a daily target.</p>
                    <Link
                      to={`/home/practice-tests/${test.id}?goal=1`}
                      className="block rounded-lg border border-[#155EEF] py-2 text-center text-xs font-semibold text-[#155EEF] hover:bg-[#EFF6FF]"
                    >
                      Set Study Goal
                    </Link>
                  </>
                ) : (
                  <p className="text-xs text-[#64748B]">Not tracked for this session type.</p>
                )}
              </div>
            )}

            {isImmediate && (
              <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-[0_2px_8px_rgba(15,23,42,0.04)] dark:bg-surface-raised">
                <div className="mb-3 text-xs font-bold uppercase tracking-wide text-[#155EEF]">🔥 Practice Momentum</div>
                <div className="text-xs text-[#64748B]">🔥 Current Streak</div>
                <div className="text-xl font-bold text-[#0F172A]">{streak}</div>
                {streak >= 2 && <p className="mt-2 text-xs font-medium text-[#F59E0B]">Keep it going!</p>}
              </div>
            )}

            {/* Question navigator — represents navigation status only
                (answered/current/unanswered/marked), never correctness
                (Section 20). Only ever holds this session's own batch, not
                the whole question bank, so this never risks loading 1,500+
                questions into the browser (Section 31). */}
            <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-[0_2px_8px_rgba(15,23,42,0.04)] dark:bg-surface-raised">
              <div className="mb-3 text-xs font-bold uppercase tracking-wide text-[#155EEF]">
                Questions ({answeredCount}/{questions.length} Answered)
              </div>
              {/* Green here means "answered," not "correct" — every
                  answered question gets this same color regardless of
                  right/wrong, so it never leaks correctness (Section 20).
                  Correctness only ever appears on the question/answer
                  card itself. */}
              <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#64748B]">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#16A34A]" /> Answered
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#155EEF]" /> Current
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full border border-[#CBD5E1] bg-white" /> Unanswered
                </span>
                <span className="inline-flex items-center gap-1">🚩 Review</span>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {questions.map((q, i) => {
                  const isAnswered = !!answers[q.id];
                  const isCurrent = i === currentIndex;
                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setCurrentIndex(i)}
                      className={`relative flex h-9 items-center justify-center rounded-md text-xs font-semibold ${
                        isCurrent
                          ? 'bg-[#155EEF] text-white'
                          : isAnswered
                            ? 'bg-[#F0FDF4] text-[#0F172A]'
                            : 'border border-[#E2E8F0] bg-white text-[#64748B] dark:bg-transparent'
                      } ${marked[q.id] ? 'ring-2 ring-[#F59E0B]' : ''}`}
                    >
                      {i + 1}
                      {marked[q.id] && <span className="absolute -right-1 -top-1 text-[9px] leading-none">🚩</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Finish Session — secondary, not competing with Next
                Question for primary-CTA attention. */}
            <button
              type="button"
              onClick={handleFinishClick}
              className="rounded-lg border border-[#16A34A] bg-[#F0FDF4] py-2.5 text-sm font-semibold text-[#16A34A] hover:bg-[#DCFCE7] dark:bg-transparent"
            >
              🏁 Finish Session
            </button>
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

      {/* End Session — never terminates instantly. The session doc stays
          in_progress (nothing is submitted here), so it's resumable later
          exactly like any other unfinished session — same persistence
          PracticeTestDetailPage's "Continue Where You Left Off" already
          reads. */}
      <ConfirmDialog
        open={showEndConfirm}
        title="End practice session?"
        message={`You've completed ${answeredCount} of ${questions.length} questions. Your completed answers will be saved, and you can resume this session later.`}
        confirmLabel="End Session"
        cancelLabel="Continue Practicing"
        onConfirm={() => {
          setShowEndConfirm(false);
          navigate('/home/practice-tests');
        }}
        onCancel={() => setShowEndConfirm(false)}
      />

      {/* No option selected yet — confirming just moves on (Next Question
          is always enabled regardless), it doesn't submit anything since
          there's nothing to grade without a selected option. */}
      <ConfirmDialog
        open={showSkipConfirm}
        title="Submit without answering?"
        message="You haven't selected an answer for this question. You can move on and it will be counted as unanswered."
        confirmLabel="Submit Unanswered"
        cancelLabel="Go Back"
        onConfirm={() => {
          setShowSkipConfirm(false);
          goToNextOrFinish();
        }}
        onCancel={() => setShowSkipConfirm(false)}
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
  onDone,
}: {
  review: {
    questions: BatchReviewQuestion[];
    summary: { totalQuestions: number; answeredCount: number; correctCount: number; incorrectCount: number };
    newPersonalBest: boolean;
    bestStreak: number;
  };
  onDone: () => void;
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
          <h1 className="mb-5 text-[22px] font-bold text-[#0F172A]">Practice Complete</h1>
          <div className="mb-3 text-xs font-bold uppercase tracking-wide text-[#155EEF]">Practice Momentum</div>

          <div className="mx-auto mb-4 grid max-w-md grid-cols-2 gap-x-4 gap-y-4 text-left">
            <div>
              <div className="text-lg font-bold text-[#F59E0B]">
                {review.newPersonalBest ? '🏆' : '🔥'} {review.bestStreak}
              </div>
              <div className="text-xs text-[#64748B]">Correct Streak</div>
            </div>
            <div>
              <div className="text-lg font-bold text-[#155EEF]">🎯 {accuracy}%</div>
              <div className="text-xs text-[#64748B]">Session Accuracy</div>
            </div>
          </div>

          <div className="mx-auto grid max-w-2xl grid-cols-2 gap-x-4 gap-y-4 border-t border-[#E2E8F0] pt-4 text-left sm:grid-cols-4">
            <div>
              <div className="text-lg font-bold text-[#0F172A]">
                📚 {review.summary.answeredCount}/{review.summary.totalQuestions}
              </div>
              <div className="text-xs text-[#64748B]">Questions</div>
            </div>
            <div>
              <div className="text-lg font-bold text-[#16A34A]">✓ {review.summary.correctCount}</div>
              <div className="text-xs text-[#64748B]">Correct</div>
            </div>
            <div>
              <div className="text-lg font-bold text-[#DC2626]">✕ {review.summary.incorrectCount}</div>
              <div className="text-xs text-[#64748B]">Incorrect</div>
            </div>
            <div>
              <div className="text-lg font-bold text-[#64748B]">
                {review.summary.totalQuestions - review.summary.answeredCount}
              </div>
              <div className="text-xs text-[#64748B]">Unanswered</div>
            </div>
          </div>
        </div>

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
