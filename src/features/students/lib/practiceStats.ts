// Derivations over `practiceProgress` docs - cumulative accuracy, weak
// areas, and the Mastered / Learning / Needs Review / Unseen buckets.
// Extracted from PracticeTestDetailPage so the per-certification detail
// page can reuse the exact same maths across a whole series of banks.

import type { PracticeConfidence } from '@/types/models';

export interface QuestionStat {
  attempts: number;
  correct: number;
  lastConfidence?: PracticeConfidence;
}

export interface PracticeProgressLike {
  answeredQuestionIds: string[];
  incorrectQuestionIds: string[];
  questionStats: Record<string, QuestionStat>;
}

const EMPTY: PracticeProgressLike = { answeredQuestionIds: [], incorrectQuestionIds: [], questionStats: {} };

// Fold several banks' progress docs into one shape. Question ids live in a
// per-bank subcollection so they don't collide across banks in practice;
// on the vanishingly rare chance they do, the merge is still only used for
// display counts, never for gating.
export function mergePracticeProgress(docs: (PracticeProgressLike | null | undefined)[]): PracticeProgressLike {
  const answered = new Set<string>();
  const incorrect = new Set<string>();
  const questionStats: Record<string, QuestionStat> = {};
  for (const d of docs) {
    if (!d) continue;
    for (const id of d.answeredQuestionIds) answered.add(id);
    for (const id of d.incorrectQuestionIds) incorrect.add(id);
    for (const [id, s] of Object.entries(d.questionStats ?? {})) {
      const cur = questionStats[id] ?? { attempts: 0, correct: 0 };
      questionStats[id] = {
        attempts: cur.attempts + s.attempts,
        correct: cur.correct + s.correct,
        lastConfidence: s.lastConfidence ?? cur.lastConfidence,
      };
    }
  }
  return {
    answeredQuestionIds: [...answered],
    incorrectQuestionIds: [...incorrect],
    questionStats,
  };
}

// Cumulative correct / attempts across every answered question, as a
// whole-number percent. null when nothing has been attempted yet (so the
// caller can hide the figure rather than show a misleading 0%).
export function accuracyPct(progress: PracticeProgressLike | null | undefined): number | null {
  const stats = Object.values((progress ?? EMPTY).questionStats);
  const attempts = stats.reduce((sum, s) => sum + s.attempts, 0);
  if (attempts === 0) return null;
  const correct = stats.reduce((sum, s) => sum + s.correct, 0);
  return Math.round((correct / attempts) * 100);
}

// Questions whose cumulative accuracy is stuck below 50%.
export function weakAreaCount(progress: PracticeProgressLike | null | undefined): number {
  return Object.values((progress ?? EMPTY).questionStats).filter((s) => s.attempts > 0 && s.correct / s.attempts < 0.5)
    .length;
}

export interface BankBuckets {
  mastered: number;
  learning: number;
  needsReview: number;
  unseen: number;
}

// Section 29's Question Bank Dashboard split, derived rather than stored:
// Needs Review = last answer wrong; the rest split by cumulative accuracy
// at the 0.8 line; Unseen = never answered.
export function bankBuckets(progress: PracticeProgressLike | null | undefined, totalQuestions: number): BankBuckets {
  const p = progress ?? EMPTY;
  const incorrect = new Set(p.incorrectQuestionIds);
  let mastered = 0;
  let learning = 0;
  for (const qid of p.answeredQuestionIds) {
    if (incorrect.has(qid)) continue;
    const s = p.questionStats[qid];
    const acc = s && s.attempts > 0 ? s.correct / s.attempts : 0;
    if (acc >= 0.8) mastered += 1;
    else learning += 1;
  }
  return {
    mastered,
    learning,
    needsReview: incorrect.size,
    unseen: Math.max(0, totalQuestions - p.answeredQuestionIds.length),
  };
}
