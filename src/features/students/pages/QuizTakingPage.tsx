import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getQuizWithQuestions } from '../api/studentContentApi';
import { quizSessionApi, type QuizAttemptState } from '../api/quizSessionApi';
import { useUiStore } from '@/store/useUiStore';
import { toDate } from '@/utils/formatDate';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { VercelApiError } from '@/lib/vercelApi';

interface AnswerFeedback {
  isCorrect: boolean | null;
  correctOptionId: string | null;
}

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function QuizTakingPage() {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();
  const pushToast = useUiStore((s) => s.pushToast);

  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<QuizAttemptState | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, AnswerFeedback>>({});
  const [marked, setMarked] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [finalResult, setFinalResult] = useState<QuizAttemptState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const startedRef = useRef(false);

  const { data } = useQuery({
    queryKey: ['student', 'quizContent', quizId],
    queryFn: () => getQuizWithQuestions(quizId!),
    enabled: !!quizId,
  });

  useEffect(() => {
    if (!quizId || startedRef.current) return;
    startedRef.current = true;
    quizSessionApi
      .startAttempt(quizId)
      .then((res) => {
        setAttemptId(res.attemptId);
        setAttempt(res.attempt);
      })
      .catch((err) => {
        pushToast(err instanceof Error ? err.message : 'Could not start this quiz', 'error');
        // The client-side gate (see StudentHomePage) already hides "Start"
        // behind "Add to Cart" for an unpurchased quiz — this 402 is a
        // backstop for a stale cache or a direct URL, so send them
        // somewhere useful rather than just back to the listing.
        navigate(err instanceof VercelApiError && err.status === 402 ? '/home/cart' : '/home');
      });
  }, [quizId, navigate, pushToast]);

  // Countdown, ticking from the server-issued expiresAt so a refresh doesn't
  // grant extra time.
  useEffect(() => {
    if (!attempt || finalResult) return;
    const tick = () => {
      // attempt.expiresAt arrives over JSON as a serialized Firestore
      // Timestamp — { _seconds, _nanoseconds }, NOT { seconds } — reading
      // the wrong field silently produced NaN*1000 here (confirmed live:
      // the countdown showed "NaN:NaN" for every quiz-taker). toDate()
      // handles that shape correctly.
      const secs = Math.max(0, Math.round((toDate(attempt.expiresAt).getTime() - Date.now()) / 1000));
      setRemainingSeconds(secs);
      if (secs === 0 && attemptId) handleSubmit(true);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, finalResult, attemptId]);

  // Anti-cheat: count tab-switch / app-blur events while the attempt is active.
  useEffect(() => {
    if (!attemptId || finalResult) return;
    const onVisibility = () => {
      if (document.hidden) quizSessionApi.recordExit(attemptId).catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onVisibility);
    };
  }, [attemptId, finalResult]);

  const questions = useMemo(() => data?.questions ?? [], [data]);
  const quiz = data?.quiz;
  const current = questions[currentIndex];

  // Grading is a real network round-trip (the answer key is never shipped
  // to the client up front). Tapping an option then immediately tapping
  // Next/Submit before that round-trip resolves used to look like feedback
  // "randomly" not showing — confirmed live: fast taps outran the response.
  // `saving` now blocks Next/Submit and the options themselves until this
  // question's save is back, so a result (or a save failure) is always seen
  // before you can move on.
  const handleSelect = async (optionId: string) => {
    if (!attemptId || !current || saving) return;
    setAnswers((prev) => ({ ...prev, [current.id]: optionId }));
    setSaving(true);
    try {
      const res = await quizSessionApi.saveAnswer(attemptId, current.id, optionId);
      if (quiz?.showImmediateResult) {
        setFeedback((prev) => ({ ...prev, [current.id]: { isCorrect: res.isCorrect, correctOptionId: res.correctOptionId } }));
      }
    } catch {
      pushToast('Could not save that answer — check your connection', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleMark = (id: string) => setMarked((prev) => ({ ...prev, [id]: !prev[id] }));
  const markedCount = useMemo(() => Object.values(marked).filter(Boolean).length, [marked]);

  const canAdvance = !quiz?.enforceSequentialNav || !!answers[current?.id ?? ''];

  const handleSubmit = useCallback(
    async (auto = false) => {
      if (!attemptId || submitting) return;
      setSubmitting(true);
      try {
        const res = await quizSessionApi.submitAttempt(attemptId);
        setFinalResult(res.attempt);
        if (auto) pushToast('Time is up — your quiz was submitted automatically', 'info');
      } catch (err) {
        pushToast(err instanceof Error ? err.message : 'Could not submit', 'error');
      } finally {
        setSubmitting(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [attemptId, submitting]
  );

  if (finalResult) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-4">
        <div className="w-full max-w-md rounded-xl border border-surface-border bg-surface-raised p-8 text-center">
          <h1 className="mb-4 text-xl font-semibold text-ink">Quiz Submitted</h1>
          {quiz?.showFinalScore ? (
            <div className="space-y-1 text-ink-muted">
              <div className="text-3xl font-bold text-brand-ink">{finalResult.marks}</div>
              <div className="text-sm text-ink-faint">
                {finalResult.correctCount} correct · {finalResult.incorrectCount} incorrect · {finalResult.notAnsweredCount} unanswered
              </div>
            </div>
          ) : (
            <p className="text-ink-faint">Your responses have been recorded.</p>
          )}
          <button
            type="button"
            onClick={() => navigate('/home')}
            className="mt-6 w-full rounded-lg bg-brand-gradient py-2.5 font-medium text-surface"
          >
            Back to Available Quizzes
          </button>
        </div>
      </div>
    );
  }

  if (!quiz || !current) {
    return <div className="p-8 text-ink-faint">Loading quiz…</div>;
  }

  const answeredCount = Object.keys(answers).length;
  const unansweredCount = questions.length - answeredCount;
  const result = feedback[current.id];
  const answered = quiz.showImmediateResult && !!result;

  // Submit is available from any question, not just the last one — clicking
  // it while questions are still unanswered asks for confirmation first
  // (with the actual count) rather than submitting immediately, since this
  // is a one-way action for a strict/timed quiz.
  const handleSubmitClick = () => {
    if (unansweredCount > 0) {
      setShowSubmitConfirm(true);
    } else {
      handleSubmit(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface px-4 py-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-ink">{quiz.title}</h1>
          <div className="flex items-center gap-3">
            {markedCount > 0 && <span className="text-sm text-amber-400">🚩 {markedCount} marked</span>}
            <span className="rounded-lg border border-surface-border px-3 py-1.5 text-sm font-mono text-brand-ink">
              ⏱ {formatClock(remainingSeconds)}
            </span>
          </div>
        </div>

        {/* Right-side panel on desktop (fixed width, sticky so it stays
            reachable while scrolling a long question) — stacks above the
            question on mobile instead, same as before. Its own scroll area
            stays bounded regardless of question count: a bare flex-wrap
            here previously grew without limit, so a real 1000+ question
            bank rendered a wall of number buttons before the question ever
            appeared. */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_260px]">
          <div className="order-2 lg:order-1">
            <div className="rounded-xl border border-surface-border bg-surface-raised p-6">
              <h2 className="mb-4 font-medium text-ink">
                Q{currentIndex + 1}. {current.questionText}
              </h2>
              <div className="space-y-2">
                {current.options.map((opt) => {
                  const selected = answers[current.id] === opt.id;
                  const isTheCorrectOption = answered && result.correctOptionId === opt.id;
                  const isWrongPick = answered && selected && !result.isCorrect;

                  let cls = 'border-surface-border text-ink-muted hover:border-neutral-600';
                  if (answered) {
                    if (isTheCorrectOption) cls = 'border-emerald-500 bg-emerald-500/10 text-emerald-300';
                    else if (isWrongPick) cls = 'border-red-500 bg-red-500/10 text-red-300';
                    else cls = 'border-surface-border text-ink-faint opacity-60';
                  } else if (selected) {
                    cls = 'border-brand-400 bg-brand-500/10 text-brand-200';
                  }

                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={saving}
                      onClick={() => handleSelect(opt.id)}
                      className={`flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-left text-sm disabled:cursor-not-allowed ${cls}`}
                    >
                      <span>{opt.text}</span>
                      {isTheCorrectOption && <span className="shrink-0 text-xs font-semibold">✓ Correct answer</span>}
                    </button>
                  );
                })}
              </div>
              {saving && <div className="mt-3 text-sm text-ink-faint">Checking…</div>}
              {answered && (
                <div
                  className={`mt-3 rounded-lg px-4 py-2 text-sm font-semibold ${
                    result.isCorrect ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'
                  }`}
                >
                  {result.isCorrect ? '✓ Correct!' : '✗ Incorrect — the right answer is highlighted above'}
                </div>
              )}
            </div>

            {/* Previous/Next stay together as one tight row for fast
                navigation. Mark for Review sits next to Submit Quiz instead
                of beside the question header — it used to squeeze the
                question text into a narrow column on mobile. */}
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
                {currentIndex < questions.length - 1 && (
                  <button
                    type="button"
                    disabled={!canAdvance || saving}
                    onClick={() => setCurrentIndex((i) => i + 1)}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
                  >
                    Next →
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => toggleMark(current.id)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    marked[current.id]
                      ? 'border-amber-400 bg-amber-400/10 text-amber-300'
                      : 'border-surface-border text-ink-faint hover:border-neutral-600'
                  }`}
                >
                  🚩 {marked[current.id] ? 'Marked' : 'Mark for Review'}
                </button>
                <button
                  type="button"
                  disabled={submitting || saving}
                  onClick={handleSubmitClick}
                  className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
                >
                  {submitting ? 'Submitting…' : 'Submit Quiz'}
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
                        ? 'bg-brand-500 text-surface'
                        : answers[q.id]
                          ? 'bg-brand-500/20 text-brand-ink'
                          : 'bg-white/5 text-ink-faint'
                    } ${marked[q.id] ? 'ring-2 ring-amber-400' : ''}`}
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
        open={showSubmitConfirm}
        title="Submit quiz now?"
        message={`You still have ${unansweredCount} question${unansweredCount === 1 ? '' : 's'} unanswered. Once you submit, you won't be able to come back and answer them. Submit anyway?`}
        confirmLabel="Submit anyway"
        cancelLabel="Keep working"
        onConfirm={() => {
          setShowSubmitConfirm(false);
          handleSubmit(false);
        }}
        onCancel={() => setShowSubmitConfirm(false)}
      />
    </div>
  );
}
