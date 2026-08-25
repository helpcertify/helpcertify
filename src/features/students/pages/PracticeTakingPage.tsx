import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getPracticeQuestionsByIds } from '../api/studentContentApi';
import { practiceSessionApi, type PracticeSessionState } from '../api/practiceSessionApi';
import { useUiStore } from '@/store/useUiStore';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { VercelApiError } from '@/lib/vercelApi';
import type { QuestionDoc } from '@/types/models';

interface AnswerFeedback {
  isCorrect: boolean;
  correctOptionId: string | null;
}

export function PracticeTakingPage() {
  const { testId } = useParams<{ testId: string }>();
  const [searchParams] = useSearchParams();
  const isReattempt = searchParams.get('reattempt') === '1';
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
  const [submitted, setSubmitted] = useState(false);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!testId || startedRef.current) return;
    startedRef.current = true;
    const start = isReattempt ? practiceSessionApi.reattemptLastBatch(testId) : practiceSessionApi.startOrResumeBatch(testId);
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
  }, [testId, isReattempt, navigate, pushToast]);

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
      setFeedback((prev) => ({ ...prev, [current.id]: { isCorrect: res.isCorrect, correctOptionId: res.correctOptionId } }));
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
      setSubmitted(true);
    } catch {
      pushToast('Could not submit this batch', 'error');
    }
  };

  const unansweredCount = questions.length - answeredCount;

  // Finish is available from any question in the batch, not just the last
  // one — clicking it with questions still unanswered confirms first (with
  // the actual count) rather than finishing immediately.
  const handleFinishClick = () => {
    if (unansweredCount > 0) {
      setShowFinishConfirm(true);
    } else {
      handleFinish();
    }
  };

  if (submitted) {
    const correct = Object.values(feedback).filter((f) => f.isCorrect).length;
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-4">
        <div className="w-full max-w-md rounded-xl border border-surface-border bg-surface-raised p-8 text-center">
          <h1 className="mb-4 text-xl font-bold text-ink">Batch Complete</h1>
          <div className="text-3xl font-bold text-brand-ink">
            {correct} / {questions.length}
          </div>
          <p className="mt-1 text-sm text-ink-faint">correct in this batch</p>
          <button
            type="button"
            onClick={() => navigate('/home/practice-tests')}
            className="mt-6 w-full rounded-lg bg-brand-gradient py-2.5 font-medium text-surface"
          >
            Back to Practice Exams
          </button>
        </div>
      </div>
    );
  }

  if (!session || !current) return <div className="p-8 text-ink-faint">Loading practice session…</div>;

  const result = feedback[current.id];
  const answered = !!result;

  return (
    <div className="min-h-screen bg-surface px-4 py-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-ink">
            Practice Session {isReattempt && <span className="text-sm text-ink-faint">(Reattempt)</span>}
          </h1>
          <div className="flex items-center gap-3 text-sm text-ink-faint">
            {markedCount > 0 && <span className="text-amber-700 dark:text-amber-400">🚩 {markedCount} marked</span>}
            <span>
              {answeredCount} / {questions.length} answered
            </span>
          </div>
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
                  const isTheCorrectOption = answered && result.correctOptionId === opt.id;
                  const isWrongPick = answered && selected && !result.isCorrect;

                  // The plain -300 shades read fine on a near-black dark-theme
                  // card but washed out to near-illegible on the light theme's
                  // white card — dark: variants pick a solid, readable shade
                  // per theme instead of one compromise color for both.
                  let cls = 'border-surface-border text-ink-muted hover:border-neutral-600';
                  if (answered) {
                    if (isTheCorrectOption) cls = 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
                    else if (isWrongPick) cls = 'border-red-500 bg-red-500/10 text-red-700 dark:text-red-300';
                    else cls = 'border-surface-border text-ink-faint opacity-60';
                  } else if (selected) {
                    cls = 'border-brand-400 bg-brand-500/10 text-brand-ink';
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
                      {isWrongPick && <span className="shrink-0 text-xs font-semibold">✗ Incorrect</span>}
                    </button>
                  );
                })}
              </div>
              {saving && <div className="mt-3 text-sm text-ink-faint">Checking…</div>}
              {/* Only a positive confirmation banner — a wrong pick is
                  already unambiguous from the red/green option highlighting
                  above, so a second "Incorrect" line was redundant and (per
                  the same light-theme contrast issue) hard to read. */}
              {answered && result.isCorrect && (
                <div className="mt-3 rounded-lg bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  ✓ Correct!
                </div>
              )}
            </div>

            {/* Previous/Next stay together as one tight row for fast
                navigation. Mark for Review moved out of the question header
                (it was squeezing question text into a narrow column) down
                next to Finish Batch — both are "side" actions, separate from
                the Previous/Next pair a thumb reaches for most often. */}
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
                    disabled={saving}
                    onClick={() => setCurrentIndex((i) => i + 1)}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
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
                  disabled={saving}
                  onClick={handleFinishClick}
                  className="rounded-lg bg-[#1D4ED8] px-6 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
                >
                  Finish Batch
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
        open={showFinishConfirm}
        title="Finish this batch now?"
        message={`You still have ${unansweredCount} question${unansweredCount === 1 ? '' : 's'} unanswered in this batch. Once you finish, you won't be able to come back and answer them here. You can always start a new session for the rest. Finish anyway?`}
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
