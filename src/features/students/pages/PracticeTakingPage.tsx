import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getPracticeQuestionsByIds } from '../api/studentContentApi';
import { practiceSessionApi, type BatchReviewQuestion, type PracticeSessionState } from '../api/practiceSessionApi';
import { useUiStore } from '@/store/useUiStore';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { VercelApiError } from '@/lib/vercelApi';
import type { PracticeFeedbackMode, QuestionDoc } from '@/types/models';

interface AnswerFeedback {
  isCorrect: boolean | null;
  correctOptionId: string | null;
  explanation: string | null;
}

export function PracticeTakingPage() {
  const { testId } = useParams<{ testId: string }>();
  const [searchParams] = useSearchParams();
  const isReattempt = searchParams.get('reattempt') === '1';
  const sessionSizeParam = searchParams.get('sessionSize');
  const sessionSize = sessionSizeParam ? Number(sessionSizeParam) : undefined;
  const feedbackModeParam = searchParams.get('feedbackMode');
  const requestedFeedbackMode: PracticeFeedbackMode = feedbackModeParam === 'end_of_session' ? 'end_of_session' : 'immediate';
  const navigate = useNavigate();
  const pushToast = useUiStore((s) => s.pushToast);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [session, setSession] = useState<PracticeSessionState | null>(null);
  const [questions, setQuestions] = useState<(QuestionDoc & { id: string })[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, AnswerFeedback>>({});
  const [marked, setMarked] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [review, setReview] = useState<{
    questions: BatchReviewQuestion[];
    summary: { totalQuestions: number; answeredCount: number; correctCount: number; incorrectCount: number };
  } | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!testId || startedRef.current) return;
    startedRef.current = true;
    const start = isReattempt
      ? practiceSessionApi.reattemptLastBatch(testId, requestedFeedbackMode)
      : practiceSessionApi.startOrResumeBatch(testId, sessionSize, requestedFeedbackMode);
    start
      .then(async (res) => {
        setSessionId(res.sessionId);
        setSession(res.session);
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
  }, [testId, isReattempt, sessionSize, requestedFeedbackMode, navigate, pushToast]);

  // The server's own record of this session's mode is what actually gates
  // the UI, not the query param used to request it — a resumed session
  // keeps whatever mode it was started with (session.feedbackMode falls
  // back to 'immediate' for a session created before this field existed).
  const feedbackMode: PracticeFeedbackMode = session?.feedbackMode ?? 'immediate';
  const isImmediate = feedbackMode === 'immediate';

  const current = questions[currentIndex];
  const answeredCount = useMemo(() => Object.keys(answers).length, [answers]);
  const markedCount = useMemo(() => Object.values(marked).filter(Boolean).length, [marked]);

  // Grading a practice answer is a real network round-trip (the answer key
  // lives server-side, on purpose — it's never shipped to the client up
  // front). Tapping an option then immediately tapping Next/Finish before
  // that round-trip resolves used to look like feedback "randomly" not
  // showing — confirmed live: fast taps outran the response. `saving` now
  // blocks Next/Finish and the options themselves until this question's
  // result is back, so the result is always seen before you can move on.
  const handleSelect = async (optionId: string) => {
    if (!sessionId || !current || saving) return;
    setAnswers((prev) => ({ ...prev, [current.id]: optionId }));
    setSaving(true);
    try {
      const res = await practiceSessionApi.saveAnswer(sessionId, current.id, optionId);
      setFeedback((prev) => ({
        ...prev,
        [current.id]: { isCorrect: res.isCorrect, correctOptionId: res.correctOptionId, explanation: res.explanation },
      }));
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
      await practiceSessionApi.submitBatch(sessionId);
      const data = await practiceSessionApi.getBatchReview(sessionId);
      setReview(data);
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
    return <PracticeReviewScreen review={review} onDone={() => navigate('/home/practice-tests')} />;
  }

  if (!session || !current) return <div className="p-8 text-ink-faint">Loading practice session…</div>;

  const result = feedback[current.id];
  // Only 'immediate' mode ever has a non-null isCorrect — 'end_of_session'
  // always gets isCorrect: null back from saveAnswer, so this can never
  // accidentally reveal correctness in that mode even if `result` exists.
  const revealed = isImmediate && !!result && result.isCorrect !== null;

  return (
    <div className="min-h-screen bg-surface px-4 py-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-1 flex items-center justify-between">
          <h1 className="text-lg font-bold text-ink">
            Practice Session {isReattempt && <span className="text-sm text-ink-faint">(Reattempt)</span>}
          </h1>
          <div className="flex items-center gap-3 text-sm text-ink-faint">
            {markedCount > 0 && <span className="text-[#d87f1d]">🚩 {markedCount} marked</span>}
            <span>
              {answeredCount} / {questions.length} answered
            </span>
          </div>
        </div>
        <div className="mb-4 text-xs text-[#64748B]">
          Question {currentIndex + 1} of {questions.length}
        </div>

        {/* Right-side question navigator on desktop (mirrors QuizTakingPage) —
            stacks above the question on mobile. Marked-for-review questions
            get an amber ring + flag so they're easy to spot and jump back to. */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_260px]">
          <div className="order-2 lg:order-1">
            <div className="rounded-xl border border-surface-border bg-surface-raised p-6">
              <h2 className="mb-4 font-medium text-ink">
                Q{currentIndex + 1}. {current.questionText}
              </h2>
              <div className="space-y-2">
                {current.options.map((opt) => {
                  const selected = answers[current.id] === opt.id;
                  const isTheCorrectOption = revealed && result.correctOptionId === opt.id;
                  const isWrongPick = revealed && selected && !result.isCorrect;

                  // The plain -300 shades read fine on a near-black dark-theme
                  // card but washed out to near-illegible on the light theme's
                  // white card — dark: variants pick a solid, readable shade
                  // per theme instead of one compromise color for both.
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
                      disabled={saving || !!result}
                      onClick={() => handleSelect(opt.id)}
                      className={`flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left text-sm disabled:cursor-not-allowed ${cls}`}
                    >
                      <span>{opt.text}</span>
                      {isTheCorrectOption && <span className="shrink-0 text-xs font-semibold">✓</span>}
                      {isWrongPick && <span className="shrink-0 text-xs font-semibold">✕</span>}
                    </button>
                  );
                })}
              </div>
              {saving && <div className="mt-3 text-sm text-ink-faint">Checking…</div>}

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
              {!isImmediate && !!result && (
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
                {currentIndex < questions.length - 1 && (!isImmediate || !!result) && (
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

          <div className="order-1 lg:order-2">
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
  onDone,
}: {
  review: { questions: BatchReviewQuestion[]; summary: { totalQuestions: number; answeredCount: number; correctCount: number; incorrectCount: number } };
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
