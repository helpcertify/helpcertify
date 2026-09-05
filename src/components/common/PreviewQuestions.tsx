import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { quizSessionApi } from '@/features/students/api/quizSessionApi';
import { practiceSessionApi } from '@/features/students/api/practiceSessionApi';
import { getQuizPreviewQuestions, getPracticeTestPreviewQuestions } from '@/features/students/api/studentContentApi';
import type { PurchasableItemType } from '@/types/models';

interface PreviewQuestionsProps {
  itemType: PurchasableItemType;
  itemId: string;
  // The item's own admin-configured previewQuestionCount (QuizDoc/
  // PracticeTestDoc) - passed down from the detail page rather than
  // refetched here, since that page already has the parent doc loaded.
  previewQuestionCount: number;
  // Opens the same Buy Now modal the Course Access card's own button
  // opens - passed down rather than duplicated here, so there's one Buy
  // Now flow, just two entry points into it.
  onBuyNow?: () => void;
}

// Free preview - shows the first few questions of a not-yet-owned quiz/
// practice test, lets the visitor pick an answer, and reveals correctness
// via api/quiz-session.ts's/api/practice-session.ts's previewCheckAnswer.
// Neither the question read nor the correctness check needs a purchase or
// session - see those two files for the server-side re-check that keeps
// this from ever exposing more than the first few questions' answers, even
// to someone scripting direct calls to the endpoint.
export function PreviewQuestions({ itemType, itemId, previewQuestionCount, onBuyNow }: PreviewQuestionsProps) {
  const { data: questions } = useQuery({
    queryKey: ['student', 'previewQuestions', itemType, itemId, previewQuestionCount],
    queryFn: () =>
      itemType === 'quiz'
        ? getQuizPreviewQuestions(itemId, previewQuestionCount)
        : getPracticeTestPreviewQuestions(itemId, previewQuestionCount),
    enabled: previewQuestionCount > 0,
  });
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<{ isCorrect: boolean; correctOptionId: string | null } | null>(null);
  const [checking, setChecking] = useState(false);

  if (!questions || questions.length === 0) return null;
  const question = questions[index];

  const pickOption = async (optionId: string) => {
    if (result || checking) return;
    setSelected(optionId);
    setChecking(true);
    try {
      const check =
        itemType === 'quiz'
          ? await quizSessionApi.previewCheckAnswer(itemId, question.id, optionId)
          : await practiceSessionApi.previewCheckAnswer(itemId, question.id, optionId);
      setResult(check);
    } finally {
      setChecking(false);
    }
  };

  const next = () => {
    setIndex((i) => Math.min(i + 1, questions.length - 1));
    setSelected(null);
    setResult(null);
  };

  return (
    <div className="rounded-xl border border-surface-border bg-surface-raised p-6 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[15px] font-bold uppercase tracking-wide text-brand-ink">Free Preview</h2>
        <span className="text-xs font-medium text-ink-faint">
          Question {index + 1} of {questions.length}
        </span>
      </div>
      <p className="mb-4 text-sm text-ink">{question.questionText}</p>
      <div className="space-y-2">
        {question.options.map((opt) => {
          const isSelected = selected === opt.id;
          const isCorrectOption = !!result && opt.id === result.correctOptionId;
          const showWrong = !!result && isSelected && !result.isCorrect;
          return (
            <button
              key={opt.id}
              type="button"
              disabled={!!result || checking}
              onClick={() => pickOption(opt.id)}
              className={`block w-full rounded-lg border px-3 py-2 text-left text-sm disabled:cursor-default ${
                isCorrectOption
                  ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                  : showWrong
                    ? 'border-red-500 bg-red-500/10 text-red-700 dark:text-red-400'
                    : isSelected
                      ? 'border-brand-400 bg-brand-500/10 text-ink'
                      : 'border-surface-border text-ink-muted hover:border-brand-400'
              }`}
            >
              {opt.text}
            </button>
          );
        })}
      </div>
      {result && (
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className={`text-sm font-medium ${result.isCorrect ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
            {result.isCorrect ? 'Correct!' : 'Not quite.'}
          </span>
          {index < questions.length - 1 ? (
            <button
              type="button"
              onClick={next}
              className="rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-600"
            >
              Next Question →
            </button>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-ink-faint">You've completed your free preview.</span>
              {onBuyNow && (
                <button
                  type="button"
                  onClick={onBuyNow}
                  className="rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-600"
                >
                  Buy Now to unlock the rest
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
