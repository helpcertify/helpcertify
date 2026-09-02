import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { listPracticeTestsBucketed } from '../api/studentContentApi';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { toDate } from '@/utils/formatDate';
import { computeExamDatePlan, questionsPerDayFromMinutes, calendarDaysBetween } from './studyPlan';
import type { StudyPlanDoc } from '@/types/models';

export interface PrimaryGoalSession {
  startedAt: Date;
  answeredCount: number;
  correctCount: number;
}

// The learner's single "primary" study goal - a per-practice-test plan or a
// whole-series plan (scope: 'series'). Both the home "Today's Mission" and
// the Practice Exams stat row read this; the series/test difference is
// resolved here once so those components share one code path.
export interface PrimaryGoal {
  plan: StudyPlanDoc;
  isSeries: boolean;
  totalQuestions: number;
  uniqueAnsweredCount: number;
  minutesPerQuestion: number;
  dailyTarget: number;
  // Non-reattempt practice sessions across every test the goal covers.
  sessions: PrimaryGoalSession[];
  // Where "Start Practicing" / the stat row links.
  practiceHref: string;
}

export function usePrimaryGoal(): { goal: PrimaryGoal | null } {
  const uid = useAuthStore((s) => s.firebaseUser?.uid);
  const today = new Date();

  const { data: buckets } = useQuery({ queryKey: ['student', 'practiceTests'], queryFn: listPracticeTestsBucketed });
  const { data: progressDocs } = useQuery({
    queryKey: ['student', 'practiceProgress', uid],
    queryFn: async () => {
      const snap = await getDocs(query(collection(db, 'practiceProgress'), where('userId', '==', uid)));
      return snap.docs.map((d) => {
        const data = d.data();
        return { testId: data.testId as string, answeredQuestionIds: (data.answeredQuestionIds as string[]) ?? [] };
      });
    },
    enabled: !!uid,
  });
  const { data: studyPlans } = useQuery({
    queryKey: ['student', 'studyPlans', uid],
    queryFn: async () => {
      const snap = await getDocs(query(collection(db, 'studyPlans'), where('userId', '==', uid)));
      return snap.docs.map((d) => d.data() as StudyPlanDoc);
    },
    enabled: !!uid,
  });
  const { data: allSessions } = useQuery({
    queryKey: ['student', 'allPracticeSessions', uid],
    queryFn: async () => {
      // userId-only (a guaranteed single-field index) - filter isReattempt /
      // testId client-side rather than needing a composite index for `in`.
      const snap = await getDocs(query(collection(db, 'practiceSessions'), where('userId', '==', uid)));
      return snap.docs.map((d) => {
        const data = d.data();
        return {
          testId: data.testId as string,
          isReattempt: !!data.isReattempt,
          startedAt: toDate(data.startedAt),
          answeredCount: (data.answeredCount as number) ?? 0,
          correctCount: (data.correctCount as number) ?? 0,
        };
      });
    },
    enabled: !!uid,
  });

  const anyTestById = new Map(
    [...(buckets?.available ?? []), ...(buckets?.upcoming ?? []), ...(buckets?.expired ?? [])].map((t) => [t.id, t]),
  );

  const usable = (studyPlans ?? []).filter((p) =>
    p.scope === 'series' ? (p.seriesBatchIds?.length ?? 0) > 0 : anyTestById.has(p.testId),
  );
  const examDate = usable
    .filter((p) => p.planningMode === 'examDate' && p.targetExamDate)
    .map((p) => ({ plan: p, days: calendarDaysBetween(today, toDate(p.targetExamDate)) }))
    .filter((x) => x.days >= 0)
    .sort((a, b) => a.days - b.days);
  const plan = examDate[0]?.plan ?? usable[0] ?? null;
  if (!plan) return { goal: null };

  const isSeries = plan.scope === 'series';
  const testIds = isSeries ? (plan.seriesBatchIds ?? []) : [plan.testId];
  const idSet = new Set(testIds);
  const firstTest = anyTestById.get(testIds[0]);
  const totalQuestions = isSeries ? plan.seriesTotalQuestions ?? 0 : firstTest?.totalQuestions ?? 0;
  const minutesPerQuestion = firstTest?.defaultMinutesPerQuestion ?? 1.8;

  const uniqueAnsweredCount = (progressDocs ?? [])
    .filter((p) => idSet.has(p.testId))
    .reduce((sum, p) => sum + p.answeredQuestionIds.length, 0);

  let dailyTarget = 0;
  if (totalQuestions > 0) {
    if (plan.planningMode === 'examDate' && plan.targetExamDate) {
      dailyTarget = computeExamDatePlan({
        today,
        targetExamDate: toDate(plan.targetExamDate),
        totalQuestions,
        uniqueAnsweredCount,
        studyDays: plan.studyDays,
        revisionBufferDays: plan.revisionBufferDays,
        minutesPerQuestion,
      }).dailyTarget;
    } else {
      dailyTarget =
        plan.paceQuestionsPerDay ?? questionsPerDayFromMinutes(plan.paceMinutesPerDay ?? 0, minutesPerQuestion);
    }
  }

  if (!(totalQuestions > 0 && dailyTarget > 0)) return { goal: null };

  const sessions = (allSessions ?? [])
    .filter((s) => !s.isReattempt && idSet.has(s.testId))
    .map((s) => ({ startedAt: s.startedAt, answeredCount: s.answeredCount, correctCount: s.correctCount }));

  return {
    goal: {
      plan,
      isSeries,
      totalQuestions,
      uniqueAnsweredCount,
      minutesPerQuestion,
      dailyTarget,
      sessions,
      practiceHref: isSeries ? '/home/practice-tests' : `/home/practice-tests/${plan.testId}`,
    },
  };
}
