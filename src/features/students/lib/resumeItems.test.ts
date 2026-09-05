import { describe, it, expect } from 'vitest';
import { mergeResumeItems } from './resumeItems';

describe('mergeResumeItems', () => {
  it('merges the three sources and sorts by recency', () => {
    const items = mergeResumeItems(
      [{ quizId: 'q1', quizTitle: 'CISM Mock', status: 'in_progress', answeredCount: 10, totalQuestions: 100, startedAtMs: 300 }],
      [{ testId: 'p1', testTitle: 'Domain 2', answeredCount: 5, batchSize: 20, startedAtMs: 500 }],
      [{ courseId: 'c1', title: 'Cloud Basics', totalLessons: 8, completedCount: 2, updatedAtMs: 400 }],
    );
    expect(items.map((i) => i.id)).toEqual(['p1', 'c1', 'q1']);
    expect(items[0].kind).toBe('practice');
  });

  it('drops quiz attempts that are not in progress', () => {
    const items = mergeResumeItems(
      [{ quizId: 'q1', quizTitle: null, status: 'submitted', answeredCount: 100, totalQuestions: 100, startedAtMs: 1 }],
      [],
      [],
    );
    expect(items).toHaveLength(0);
  });

  it('drops finished courses and computes lesson/progress labels', () => {
    const items = mergeResumeItems(
      [],
      [],
      [
        { courseId: 'done', title: 'Done', totalLessons: 4, completedCount: 4, updatedAtMs: 10 },
        { courseId: 'wip', title: 'WIP', totalLessons: 4, completedCount: 1, updatedAtMs: 20 },
      ],
    );
    expect(items.map((i) => i.id)).toEqual(['wip']);
    expect(items[0].subtitle).toBe('Lesson 2 of 4');
    expect(items[0].progressPct).toBe(25);
    expect(items[0].href).toBe('/home/courses/wip');
  });

  it('caps progress at 100 and handles a zero total', () => {
    const items = mergeResumeItems(
      [{ quizId: 'q1', quizTitle: 'X', status: 'in_progress', answeredCount: 5, totalQuestions: 0, startedAtMs: 1 }],
      [],
      [],
    );
    expect(items[0].progressPct).toBe(0);
  });
});
