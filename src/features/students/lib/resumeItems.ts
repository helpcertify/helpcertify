// Pure merge for the home page's "Jump back in" row: takes the learner's
// in-progress quiz attempts, in-progress practice sessions and unfinished
// course progress and returns one recency-sorted list of resume cards. No
// I/O - co-located test in resumeItems.test.ts.

export interface ResumeQuizAttempt {
  quizId: string;
  quizTitle: string | null;
  status: string;
  answeredCount: number;
  totalQuestions: number;
  startedAtMs: number;
}

export interface ResumePracticeSession {
  testId: string;
  testTitle: string | null;
  answeredCount: number;
  batchSize: number;
  startedAtMs: number;
}

export interface ResumeCourseProgress {
  courseId: string;
  title: string;
  totalLessons: number;
  completedCount: number;
  updatedAtMs: number;
}

export type ResumeKind = 'quiz' | 'practice' | 'course';

export interface ResumeItem {
  kind: ResumeKind;
  id: string;
  title: string;
  subtitle: string;
  progressPct: number;
  href: string;
  sortKey: number;
}

function pct(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((done / total) * 100));
}

export function mergeResumeItems(
  quizAttempts: ResumeQuizAttempt[],
  practiceSessions: ResumePracticeSession[],
  courseProgress: ResumeCourseProgress[],
): ResumeItem[] {
  const items: ResumeItem[] = [];

  for (const a of quizAttempts) {
    if (a.status !== 'in_progress') continue;
    items.push({
      kind: 'quiz',
      id: a.quizId,
      title: a.quizTitle ?? 'Mock exam',
      subtitle: `${a.answeredCount} of ${a.totalQuestions} answered`,
      progressPct: pct(a.answeredCount, a.totalQuestions),
      href: `/quizzes/${a.quizId}/take`,
      sortKey: a.startedAtMs,
    });
  }

  for (const s of practiceSessions) {
    items.push({
      kind: 'practice',
      id: s.testId,
      title: s.testTitle ?? 'Practice exam',
      subtitle:
        s.batchSize > 0
          ? `Batch: ${Math.min(s.answeredCount, s.batchSize)} of ${s.batchSize} answered`
          : `${s.answeredCount} answered`,
      progressPct: pct(s.answeredCount, s.batchSize),
      href: `/practice-tests/${s.testId}/take`,
      sortKey: s.startedAtMs,
    });
  }

  for (const c of courseProgress) {
    if (c.totalLessons > 0 && c.completedCount >= c.totalLessons) continue;
    items.push({
      kind: 'course',
      id: c.courseId,
      title: c.title,
      subtitle:
        c.totalLessons > 0
          ? `Lesson ${Math.min(c.completedCount + 1, c.totalLessons)} of ${c.totalLessons}`
          : 'Continue reading',
      progressPct: pct(c.completedCount, c.totalLessons),
      href: `/home/courses/${c.courseId}`,
      sortKey: c.updatedAtMs,
    });
  }

  return items.sort((a, b) => b.sortKey - a.sortKey);
}
