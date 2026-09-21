import { describe, it, expect } from 'vitest';
import { summarizePracticeAttempts } from './practiceAttemptHistory';

describe('summarizePracticeAttempts', () => {
  it('excludes a progress doc with no real answers', () => {
    const rows = summarizePracticeAttempts([{ testId: 'a', answeredQuestionIds: [], updatedAt: '2026-09-01T00:00:00Z' }]);
    expect(rows).toHaveLength(0);
  });

  it('counts answered and incorrect questions', () => {
    const rows = summarizePracticeAttempts([
      { testId: 'a', answeredQuestionIds: ['q1', 'q2', 'q3'], incorrectQuestionIds: ['q2'], updatedAt: '2026-09-01T00:00:00Z' },
    ]);
    expect(rows[0]).toMatchObject({ testId: 'a', answeredCount: 3, incorrectCount: 1 });
  });

  it('sorts most recently practiced first', () => {
    const rows = summarizePracticeAttempts([
      { testId: 'old', answeredQuestionIds: ['q1'], updatedAt: '2026-01-01T00:00:00Z' },
      { testId: 'new', answeredQuestionIds: ['q1'], updatedAt: '2026-09-01T00:00:00Z' },
      { testId: 'mid', answeredQuestionIds: ['q1'], updatedAt: '2026-05-01T00:00:00Z' },
    ]);
    expect(rows.map((r) => r.testId)).toEqual(['new', 'mid', 'old']);
  });

  it('handles a missing updatedAt without throwing', () => {
    const rows = summarizePracticeAttempts([{ testId: 'a', answeredQuestionIds: ['q1'] }]);
    expect(rows).toHaveLength(1);
  });
});
