import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { getSeriesStudyPlan } from '../api/studyPlanApi';
import { toDate, formatShortDate } from '@/utils/formatDate';
import {
  computeExamDatePlan,
  computePacePlan,
  questionsPerDayFromMinutes,
  calendarDaysBetween,
  buildDailyAnsweredMap,
  computeStudyStreak,
} from '../lib/studyPlan';
import type { StudyPlanDoc } from '@/types/models';

export interface SeriesStudyGoalView {
  plan: StudyPlanDoc;
  // "Exam Date" (learner-chosen) vs "Suggested Exam" (computed from pace) -
  // same distinction PlanSummaryCard uses, carried over here.
  dateLabel: string;
  dateValue: string;
  daysNote: string;
  dailyTarget: number;
  streak: number;
}

// The series-scoped equivalent of PracticeTestDetailPage's PlanSummaryCard
// calculation, for the "Your Study Goal" sticky card. Same calculation
// engine (studyPlan.ts), same streak-session query pattern StudyPlanCard /
// usePrimaryGoal already use, just scoped to this one series' batches
// instead of "the whole account" or "one practice test".
export function useSeriesStudyGoal(params: {
  seriesId: string;
  batchIds: string[];
  totalQuestions: number;
  uniqueAnsweredCount: number;
  revisionBufferDays: number;
  defaultMinutesPerQuestion: number;
}) {
  const { seriesId, batchIds, totalQuestions, uniqueAnsweredCount, revisionBufferDays, defaultMinutesPerQuestion } = params;
  const uid = useAuthStore((s) => s.firebaseUser?.uid);

  const planQ = useQuery({
    queryKey: ['student', 'seriesStudyPlan', uid, seriesId],
    queryFn: () => getSeriesStudyPlan(uid!, seriesId),
    enabled: !!uid && !!seriesId,
  });

  const idSet = useMemo(() => new Set(batchIds), [batchIds]);
  const sessionsQ = useQuery({
    queryKey: ['student', 'seriesStreakSessions', uid, seriesId],
    queryFn: async () => {
      const snap = await getDocs(query(collection(db, 'practiceSessions'), where('userId', '==', uid)));
      return snap.docs
        .map((d) => d.data())
        .filter((s) => !s.isReattempt && idSet.has(s.testId as string))
        .map((s) => ({ startedAt: toDate(s.startedAt), answeredCount: (s.answeredCount as number) ?? 0 }));
    },
    enabled: !!uid && !!planQ.data,
  });

  const data: SeriesStudyGoalView | null = useMemo(() => {
    const plan = planQ.data;
    if (!plan) return null;
    const today = new Date();

    let dailyTarget: number;
    let dateLabel: string;
    let dateValue: string;
    let daysNote: string;

    if (plan.planningMode === 'examDate' && plan.targetExamDate) {
      const targetExamDate = toDate(plan.targetExamDate);
      const examPlan = computeExamDatePlan({
        today,
        targetExamDate,
        totalQuestions,
        uniqueAnsweredCount,
        studyDays: plan.studyDays,
        revisionBufferDays,
        minutesPerQuestion: defaultMinutesPerQuestion,
      });
      dailyTarget = examPlan.dailyTarget;
      dateLabel = 'Exam Date';
      dateValue = formatShortDate(targetExamDate);
      daysNote = examPlan.daysToExam >= 0 ? `${examPlan.daysToExam} Day${examPlan.daysToExam === 1 ? '' : 's'} Left` : 'Passed';
    } else {
      dailyTarget = plan.paceQuestionsPerDay ?? questionsPerDayFromMinutes(plan.paceMinutesPerDay ?? 0, defaultMinutesPerQuestion);
      const pacePlan = computePacePlan({
        today,
        totalQuestions,
        uniqueAnsweredCount,
        studyDays: plan.studyDays,
        revisionBufferDays,
        minutesPerQuestion: defaultMinutesPerQuestion,
        paceQuestionsPerDay: dailyTarget,
      });
      const daysToSuggestedExam = calendarDaysBetween(today, pacePlan.suggestedExamDate);
      dateLabel = 'Suggested Exam';
      dateValue = formatShortDate(pacePlan.suggestedExamDate);
      daysNote = daysToSuggestedExam >= 0 ? `${daysToSuggestedExam} Day${daysToSuggestedExam === 1 ? '' : 's'} Left` : 'Passed';
    }

    const streak = computeStudyStreak({
      today,
      studyDays: plan.studyDays,
      dailyTarget,
      dailyAnsweredMap: buildDailyAnsweredMap(sessionsQ.data ?? []),
    });

    return { plan, dateLabel, dateValue, daysNote, dailyTarget, streak };
  }, [planQ.data, sessionsQ.data, totalQuestions, uniqueAnsweredCount, revisionBufferDays, defaultMinutesPerQuestion]);

  return { data, isLoading: planQ.isLoading, hasPlan: !!planQ.data };
}
