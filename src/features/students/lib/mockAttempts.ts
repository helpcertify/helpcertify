// Pure aggregation over a learner's mock (quiz) attempt docs, keyed by
// quizId. Extracted out of useExamSeries.ts (which also imports Firebase)
// so this logic can be unit tested without pulling in `db`/`auth` init -
// same pattern as practiceStats.ts / resumeItems.ts.

export interface MockAttemptRecord {
  attemptId: string;
  quizId: string;
  status: string;
  correctCount: number;
  totalQuestions: number;
  scorePct: number | null;
  submittedAtMs: number | null;
  durationSeconds: number | null;
}

export interface QuizAttemptAgg {
  bestScorePct: number | null;
  hasSubmitted: boolean;
  hasInProgress: boolean;
}

export function aggregateMockAttempts(attempts: MockAttemptRecord[]): Record<string, QuizAttemptAgg> {
  const byQuiz: Record<string, QuizAttemptAgg> = {};
  for (const a of attempts) {
    const cur = byQuiz[a.quizId] ?? { bestScorePct: null, hasSubmitted: false, hasInProgress: false };
    if (a.status === 'in_progress') {
      cur.hasInProgress = true;
    } else {
      cur.hasSubmitted = true;
      if (a.scorePct != null) cur.bestScorePct = cur.bestScorePct == null ? a.scorePct : Math.max(cur.bestScorePct, a.scorePct);
    }
    byQuiz[a.quizId] = cur;
  }
  return byQuiz;
}
