import { useQuery } from '@tanstack/react-query';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { toDate } from '@/utils/formatDate';
import { calendarDaysBetween } from '@/features/students/lib/studyPlan';
import type { StudyPlanDoc } from '@/types/models';

export interface ExamCountdown {
  testId: string;
  examName: string;
  provider: string;
  examDate: Date;
  daysToExam: number;
  /**
   * When the learner most recently created or changed this exam goal
   * (the study plan's `updatedAt`). The sidebar's "Your Exams" section
   * uses this to feature the single most recently set-up exam — see
   * `featuredExamCountdown`.
   */
  updatedAt: Date;
}

// getTime() is NaN for a study plan doc missing its timestamp (predates the
// field) — treat those as oldest so a plan that *does* have one always wins.
const ms = (d: Date): number => {
  const t = d.getTime();
  return Number.isNaN(t) ? 0 : t;
};

/**
 * The one exam goal the "Your Exams" sidebar section shows: the goal the
 * learner most recently created or changed, not the soonest. Returns
 * undefined when there are no upcoming committed exam dates.
 */
export function featuredExamCountdown(
  list: ExamCountdown[] | undefined,
): ExamCountdown | undefined {
  if (!list || list.length === 0) return undefined;
  return list.reduce((best, c) => (ms(c.updatedAt) > ms(best.updatedAt) ? c : best));
}

// Shared by StudentShell's sidebar (which features just the most recently
// set-up goal — see featuredExamCountdown) and StudentHomePage's header
// badge (just the nearest one) — only considers plans where the learner
// actually chose a target exam date (Option A). A pace-mode
// plan's "suggested" exam date is a rolling estimate, not a date the
// learner committed to, so it isn't a fitting countdown here (it's already
// shown on that plan's own card on the Home dashboard). One entry per exam
// GOAL, nearest first — several practice tests covering the *same*
// certification (e.g. "CISA Practice Test 1/2/3") collapse into a single
// entry, keyed on the exam's own name + provider rather than on each
// test's id. A test's `examName` (falling back to its `title` when unset)
// is the exam name; `category` is already the existing certification-
// body/provider field.
export function useExamCountdowns() {
  const uid = useAuthStore((s) => s.firebaseUser?.uid);

  return useQuery({
    queryKey: ['student', 'examCountdowns', uid],
    queryFn: async (): Promise<ExamCountdown[]> => {
      const snap = await getDocs(query(collection(db, 'studyPlans'), where('userId', '==', uid)));
      const plans = snap.docs
        .map((d) => d.data() as StudyPlanDoc)
        .filter((p) => p.planningMode === 'examDate' && p.targetExamDate)
        .map((p) => ({
          testId: p.testId,
          examDate: toDate(p.targetExamDate),
          updatedAt: toDate(p.updatedAt),
        }))
        .filter((p) => calendarDaysBetween(new Date(), p.examDate) >= 0);

      const withTestInfo = await Promise.all(
        plans.map(async (p) => {
          const testSnap = await getDoc(doc(db, 'practiceTests', p.testId));
          const data = testSnap.data();
          // A study plan whose practice test doc no longer exists (deleted
          // by an admin after the learner set a goal on it) isn't a real
          // exam goal any more — there's nothing to show a title/provider
          // for, and no test to actually resume. Rendering it as
          // "Untitled Practice Test / Other" reads as a live, valid exam,
          // which is actively misleading, so it's dropped instead. The
          // underlying study plan itself is left untouched (never deleted
          // here) in case the test comes back.
          if (!data) {
            console.warn(`Study plan for testId "${p.testId}" points at a practice test that no longer exists — hiding its exam card.`);
            return null;
          }
          const title = (data.title as string | undefined) ?? 'Untitled Practice Test';
          const examName = (data.examName as string | undefined)?.trim() || title;
          const provider = (data.category as string | undefined) ?? 'Other';
          return { ...p, examName, provider };
        })
      );

      const byGoal = new Map<string, NonNullable<(typeof withTestInfo)[number]>>();
      for (const entry of withTestInfo) {
        if (!entry) continue;
        const key = `${entry.examName}::${entry.provider}`;
        const existing = byGoal.get(key);
        if (!existing) {
          byGoal.set(key, entry);
          continue;
        }
        // Keep the soonest date for the goal, but carry the most recent
        // updatedAt across all of its practice tests so `featuredExamCountdown`
        // still favours a goal the learner just touched on any of its tests.
        const soonest = entry.examDate < existing.examDate ? entry : existing;
        byGoal.set(key, {
          ...soonest,
          updatedAt: ms(entry.updatedAt) > ms(existing.updatedAt) ? entry.updatedAt : existing.updatedAt,
        });
      }

      return [...byGoal.values()]
        .map((entry) => ({
          testId: entry.testId,
          examName: entry.examName,
          provider: entry.provider,
          examDate: entry.examDate,
          daysToExam: calendarDaysBetween(new Date(), entry.examDate),
          updatedAt: entry.updatedAt,
        }))
        .sort((a, b) => a.daysToExam - b.daysToExam);
    },
    enabled: !!uid,
    staleTime: 5 * 60_000,
  });
}
