import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useUiStore } from '@/store/useUiStore';
import { errorText } from '@/lib/errorMessages';
import { customExamApi, getCustomExamSetForTaking } from '../api/customExamApi';
import { Spinner } from '@/components/common/Spinner';

const SECONDS_PER_QUESTION_MOCK = 90;

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// A student's own uploaded question set, taken as untimed practice or a
// timed mock exam - the mode is chosen per attempt (?mode=), not fixed at
// upload time. Deliberately simpler than QuizTakingPage/PracticeTakingPage:
// no anti-cheat, no resumable batching, no per-question immediate feedback
// (that would need a server round trip per answer, since the correct
// option is never sent to the client) - this is a personal, unproctored
// self-check, scored once at submit via api/content-admin.ts's
// submitCustomExamAttempt.
export function CustomExamTakingPage() {
  const { setId } = useParams<{ setId: string }>();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode') === 'mock' ? 'mock' : 'practice';
  const navigate = useNavigate();
  const pushToast = useUiStore((s) => s.pushToast);

  const { data: examSet, isLoading } = useQuery({
    queryKey: ['student', 'customExamSet', setId],
    queryFn: () => getCustomExamSetForTaking(setId!),
    enabled: !!setId,
  });

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [result, setResult] = useState<{ correctCount: number; totalQuestions: number; scorePercent: number } | null>(
    null
  );

  useEffect(() => {
    if (mode === 'mock' && examSet && secondsLeft === null) {
      setSecondsLeft(examSet.totalQuestions * SECONDS_PER_QUESTION_MOCK);
    }
  }, [mode, examSet, secondsLeft]);

  const submitMutation = useMutation({
    mutationFn: () => customExamApi.submitAttempt({ setId: setId!, mode, answers }),
    onSuccess: (res) => setResult(res),
    onError: (err) => pushToast(errorText(err, 'Could not submit your attempt'), 'error'),
  });

  useEffect(() => {
    if (mode !== 'mock' || secondsLeft === null || result || submitMutation.isPending) return;
    if (secondsLeft <= 0) {
      submitMutation.mutate();
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, secondsLeft, result, submitMutation.isPending]);

  const answeredCount = useMemo(() => Object.keys(answers).length, [answers]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (!examSet) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-ink-muted">This question set could not be found.</p>
      </div>
    );
  }

  if (result) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-ink">
          {result.scorePercent}% ({result.correctCount}/{result.totalQuestions})
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          {mode === 'mock' ? 'Mock exam' : 'Practice'} attempt on &quot;{examSet.title}&quot;
        </p>
        <button
          type="button"
          onClick={() => navigate('/home/custom-exams')}
          className="mt-6 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600"
        >
          Back to Custom Exam Builder
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 pb-28">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">{examSet.title}</h1>
          <p className="text-sm text-ink-faint">
            {mode === 'mock' ? 'Timed mock exam' : 'Untimed practice'} · {answeredCount}/{examSet.totalQuestions}{' '}
            answered
          </p>
        </div>
        {mode === 'mock' && secondsLeft !== null && (
          <div className="rounded-lg border border-surface-border bg-surface-raised px-4 py-2 font-mono text-lg font-semibold text-ink">
            {formatClock(secondsLeft)}
          </div>
        )}
      </div>

      <div className="space-y-6">
        {examSet.questions.map((q, i) => (
          <div key={q.id} className="rounded-xl border border-surface-border bg-surface-raised p-5">
            <p className="mb-3 font-medium text-ink">
              {i + 1}. {q.questionText}
            </p>
            <div className="space-y-2">
              {q.options.map((opt) => (
                <label
                  key={opt.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm ${
                    answers[q.id] === opt.id
                      ? 'border-brand-500 bg-brand-500/10 text-brand-ink'
                      : 'border-surface-border text-ink-muted hover:border-brand-400'
                  }`}
                >
                  <input
                    type="radio"
                    name={q.id}
                    className="mt-0.5"
                    checked={answers[q.id] === opt.id}
                    onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: opt.id }))}
                  />
                  <span>{opt.text}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-surface-border bg-surface-raised p-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <p className="text-sm text-ink-faint">{answeredCount}/{examSet.totalQuestions} answered</p>
          <button
            type="button"
            onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending}
            className="rounded-lg bg-brand-500 px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {submitMutation.isPending ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  );
}
