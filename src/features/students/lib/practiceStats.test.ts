import { describe, it, expect } from 'vitest';
import { accuracyPct, weakAreaCount, bankBuckets, mergePracticeProgress } from './practiceStats';

const progress = {
  answeredQuestionIds: ['a', 'b', 'c', 'd'],
  incorrectQuestionIds: ['d'],
  questionStats: {
    a: { attempts: 2, correct: 2 }, // mastered
    b: { attempts: 4, correct: 3 }, // learning (0.75)
    c: { attempts: 2, correct: 0 }, // weak + learning
    d: { attempts: 1, correct: 0 }, // needs review (last wrong)
  },
};

describe('practiceStats', () => {
  it('accuracyPct is cumulative correct / attempts, null when nothing attempted', () => {
    expect(accuracyPct(progress)).toBe(56); // 5 / 9
    expect(accuracyPct({ answeredQuestionIds: [], incorrectQuestionIds: [], questionStats: {} })).toBeNull();
  });

  it('weakAreaCount counts questions stuck below 50%', () => {
    expect(weakAreaCount(progress)).toBe(2); // c and d
  });

  it('bankBuckets splits mastered / learning / needs review / unseen', () => {
    expect(bankBuckets(progress, 10)).toEqual({ mastered: 1, learning: 2, needsReview: 1, unseen: 6 });
  });

  it('mergePracticeProgress unions ids and sums stats', () => {
    const merged = mergePracticeProgress([
      { answeredQuestionIds: ['a'], incorrectQuestionIds: [], questionStats: { a: { attempts: 1, correct: 1 } } },
      { answeredQuestionIds: ['a', 'b'], incorrectQuestionIds: ['b'], questionStats: { a: { attempts: 2, correct: 1 } } },
    ]);
    expect(merged.answeredQuestionIds.sort()).toEqual(['a', 'b']);
    expect(merged.incorrectQuestionIds).toEqual(['b']);
    expect(merged.questionStats.a).toEqual({ attempts: 3, correct: 2, lastConfidence: undefined });
  });
});
