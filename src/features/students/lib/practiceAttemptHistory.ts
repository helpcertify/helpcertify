import { toDate } from '@/utils/formatDate';

// Turns raw practiceProgress docs (one per learner per test, continuously
// updated as they practice - see PracticeProgressDoc) into the rows My
// Attempts' Practice Exams section renders: only tests with at least one
// real answer (a progress doc can exist with an empty
// answeredQuestionIds in edge cases, and that's not an attempt), most
// recently practiced first. Pure/no I/O so it's directly testable, same
// convention as recommendCourses.ts / relatedItems.ts - PastQuizzesPage
// does the actual Firestore read and calls this on the results.

export interface RawPracticeProgressDoc {
  testId: string;
  answeredQuestionIds?: string[];
  incorrectQuestionIds?: string[];
  updatedAt?: unknown;
}

export interface PracticeAttemptRow {
  testId: string;
  answeredCount: number;
  incorrectCount: number;
  lastPracticedAt: unknown;
}

export function summarizePracticeAttempts(docs: RawPracticeProgressDoc[]): PracticeAttemptRow[] {
  return docs
    .map((d) => ({
      testId: d.testId,
      answeredCount: d.answeredQuestionIds?.length ?? 0,
      incorrectCount: d.incorrectQuestionIds?.length ?? 0,
      lastPracticedAt: d.updatedAt,
    }))
    .filter((p) => p.answeredCount > 0)
    .sort((a, b) => (toDate(b.lastPracticedAt).getTime() || 0) - (toDate(a.lastPracticedAt).getTime() || 0));
}
