import { describe, it, expect } from 'vitest';
import { aggregateMockAttempts, type MockAttemptRecord } from './mockAttempts';

function attempt(overrides: Partial<MockAttemptRecord>): MockAttemptRecord {
  return {
    attemptId: 'a1',
    quizId: 'q1',
    status: 'submitted',
    correctCount: 0,
    totalQuestions: 10,
    scorePct: null,
    submittedAtMs: null,
    durationSeconds: null,
    ...overrides,
  };
}

describe('aggregateMockAttempts', () => {
  it('flags both hasSubmitted and hasInProgress when a multi-attempt quiz has one of each', () => {
    // Reachable whenever QuizDoc.maxAttempts > 1 (e.g. every AI-generated
    // mock series defaults to 3) - a learner submits attempt #1, then
    // starts attempt #2, which is still open while #1 is graded.
    const agg = aggregateMockAttempts([
      attempt({ attemptId: 'a1', status: 'submitted', scorePct: 60 }),
      attempt({ attemptId: 'a2', status: 'in_progress', scorePct: null }),
    ]);
    expect(agg.q1.hasSubmitted).toBe(true);
    expect(agg.q1.hasInProgress).toBe(true);
    expect(agg.q1.bestScorePct).toBe(60);
  });

  it('keeps the best score across multiple submitted attempts', () => {
    const agg = aggregateMockAttempts([
      attempt({ attemptId: 'a1', status: 'submitted', scorePct: 40 }),
      attempt({ attemptId: 'a2', status: 'submitted', scorePct: 75 }),
    ]);
    expect(agg.q1.bestScorePct).toBe(75);
    expect(agg.q1.hasInProgress).toBe(false);
  });

  it('keys aggregates independently per quiz', () => {
    const agg = aggregateMockAttempts([
      attempt({ quizId: 'q1', status: 'in_progress' }),
      attempt({ quizId: 'q2', status: 'submitted', scorePct: 90 }),
    ]);
    expect(agg.q1).toEqual({ bestScorePct: null, hasSubmitted: false, hasInProgress: true });
    expect(agg.q2).toEqual({ bestScorePct: 90, hasSubmitted: true, hasInProgress: false });
  });
});
