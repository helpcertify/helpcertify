import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getPracticeQuestionsByIds } from '../api/studentContentApi';
import { practiceSessionApi, type PracticeSessionState } from '../api/practiceSessionApi';
import { useUiStore } from '@/store/useUiStore';
import type { QuestionDoc } from '@/types/models';

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
  const [feedback, setFeedback] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
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
        navigate('/home/practice-tests');
      });
  }, [testId, isReattempt, navigate, pushToast]);

  const current = questions[currentIndex];
  const answeredCount = useMemo(() => Object.keys(answers).length, [answers]);

  const handleSelect = async (optionId: string) => {
    if (!sessionId || !current) return;
    setAnswers((prev) => ({ ...prev, [current.id]: optionId }));
    try {
      const res = await practiceSessionApi.saveAnswer(sessionId, current.id, optionId);
      setFeedback((prev) => ({ ...prev, [current.id]: res.isCorrect }));
    } catch {
      pushToast('Could not save that answer', 'error');
    }
  };

  const handleFinish = async () => {
    if (!sessionId) return;
    try {
      await practiceSessionApi.submitBatch(sessionId);
      setSubmitted(true);
    } catch {
      pushToast('Could not submit this batch', 'error');
    }
  };

  if (submitted) {
    const correct = Object.values(feedback).filter(Boolean).length;
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-4">
        <div className="w-full max-w-md rounded-xl border border-surface-border bg-surface-raised p-8 text-center">
          <h1 className="mb-4 text-xl font-semibold text-white">Batch Complete</h1>
          <div className="text-3xl font-bold text-brand-400">
            {correct} / {questions.length}
          </div>
          <p className="mt-1 text-sm text-neutral-500">correct in this batch</p>
          <button
            type="button"
            onClick={() => navigate('/home/practice-tests')}
            className="mt-6 w-full rounded-lg bg-brand-gradient py-2.5 font-medium text-surface"
          >
            Back to Practice Tests
          </button>
        </div>
      </div>
    );
  }

  if (!session || !current) return <div className="p-8 text-neutral-400">Loading practice session…</div>;

  return (
    <div className="min-h-screen bg-surface px-4 py-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-white">
            Practice Session {isReattempt && <span className="text-sm text-neutral-500">(Reattempt)</span>}
          </h1>
          <span className="text-sm text-neutral-500">
            {answeredCount} / {questions.length} answered
          </span>
        </div>

        <div className="rounded-xl border border-surface-border bg-surface-raised p-6">
          <h2 className="mb-4 font-medium text-white">
            Q{currentIndex + 1}. {current.questionText}
          </h2>
          <div className="space-y-2">
            {current.options.map((opt) => {
              const selected = answers[current.id] === opt.id;
              const isCorrect = feedback[current.id];
              const showFeedback = selected && current.id in feedback;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleSelect(opt.id)}
                  className={`block w-full rounded-lg border px-4 py-2.5 text-left text-sm ${
                    showFeedback
                      ? isCorrect
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                        : 'border-red-500 bg-red-500/10 text-red-300'
                      : selected
                        ? 'border-brand-400 bg-brand-500/10 text-brand-200'
                        : 'border-surface-border text-neutral-300 hover:border-neutral-600'
                  }`}
                >
                  {opt.text}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            disabled={currentIndex === 0}
            onClick={() => setCurrentIndex((i) => i - 1)}
            className="rounded-lg border border-surface-border px-4 py-2 text-sm text-neutral-300 disabled:opacity-40"
          >
            ← Previous
          </button>
          {currentIndex < questions.length - 1 ? (
            <button
              type="button"
              onClick={() => setCurrentIndex((i) => i + 1)}
              className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-medium text-surface"
            >
              Next →
            </button>
          ) : (
            <button type="button" onClick={handleFinish} className="rounded-lg bg-brand-gradient px-5 py-2 text-sm font-medium text-surface">
              Finish Batch
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
