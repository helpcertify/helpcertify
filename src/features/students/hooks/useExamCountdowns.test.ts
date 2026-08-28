import { describe, expect, it, vi } from 'vitest';

// The hook module imports @/lib/firebase, which calls getAuth() at load
// time — that throws under jsdom. featuredExamCountdown itself is pure and
// touches none of it, so stubbing the firebase module is enough to import it.
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {}, app: {} }));

import { featuredExamCountdown, type ExamCountdown } from './useExamCountdowns';

const make = (over: Partial<ExamCountdown>): ExamCountdown => ({
  testId: 't',
  examName: 'CISA',
  provider: 'ISACA',
  examDate: new Date('2026-10-01'),
  daysToExam: 10,
  updatedAt: new Date('2026-08-01'),
  ...over,
});

describe('featuredExamCountdown', () => {
  it('returns undefined when there are no upcoming exams', () => {
    expect(featuredExamCountdown(undefined)).toBeUndefined();
    expect(featuredExamCountdown([])).toBeUndefined();
  });

  it('picks the most recently created/changed goal, not the soonest', () => {
    const soonerButOlder = make({
      examName: 'CISM',
      examDate: new Date('2026-09-16'),
      daysToExam: 19,
      updatedAt: new Date('2026-08-10'),
    });
    const laterButNewer = make({
      examName: 'CISA',
      examDate: new Date('2026-09-30'),
      daysToExam: 33,
      updatedAt: new Date('2026-08-27'),
    });
    expect(featuredExamCountdown([soonerButOlder, laterButNewer])?.examName).toBe('CISA');
  });

  it('prefers a goal with a real updatedAt over one whose timestamp is missing (NaN)', () => {
    const missing = make({ examName: 'CISM', updatedAt: new Date(NaN) });
    const dated = make({ examName: 'CISA', updatedAt: new Date('2020-01-01') });
    expect(featuredExamCountdown([missing, dated])?.examName).toBe('CISA');
  });

  it('is stable when a single goal is present', () => {
    const only = make({ examName: 'PMP' });
    expect(featuredExamCountdown([only])).toBe(only);
  });
});
