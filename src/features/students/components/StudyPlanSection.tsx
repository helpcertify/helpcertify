import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toDate } from '@/utils/formatDate';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { useUiStore } from '@/store/useUiStore';
import { practiceSessionApi } from '../api/practiceSessionApi';
import type { StudyPlanDoc } from '@/types/models';
import {
  computeExamDatePlan,
  computePacePlan,
  questionsPerDayFromMinutes,
  buildDailyAnsweredMap,
  computeStudyStreak,
  newlyCrossedThresholds,
  QUESTION_MILESTONES,
  PERCENT_MILESTONES,
  STREAK_MILESTONES,
} from '../lib/studyPlan';

function milestoneCelebrationText(key: string): string {
  const [kind, raw] = key.split('_');
  if (kind === 'questions') return `🎉 Milestone reached: ${raw} questions answered!`;
  if (kind === 'percent') return `🎉 Milestone reached: ${raw}% complete!`;
  if (kind === 'streak') return `🔥 Milestone reached: ${raw}-day study streak!`;
  return '🎉 Milestone reached!';
}

// "Your Learning Journey" on My Profile — same plan/progress calculations
// as before (studyPlan.ts is untouched), restyled into the design system's
// compact 3-stat horizontal card instead of the old fuller card (streak
// chip, status chip, insight sentence, recovery callout). Those extra
// numbers still get computed and still drive the milestone-celebration
// toast (the mutation/effect below is unchanged) — they're just no longer
// rendered here, since the new Profile page is meant to be a condensed
// identity + goal summary, not a second dashboard (see My Exams below for
// the actual "start a session" actions, so this card doesn't need one too).
export interface StudyPlanCardData {
  testId: string;
  testTitle: string;
  testCategory: string;
  totalQuestions: number;
  minutesPerQuestion: number;
  uniqueAnsweredCount: number;
  plan: StudyPlanDoc;
}

export function StudyPlanSection({ cards, unplannedTest }: { cards: StudyPlanCardData[]; unplannedTest: { id: string; title: string } | null }) {
  if (cards.length === 0 && !unplannedTest) return null;

  return (
    <div className="mb-6">
      <h2 className="mb-3 text-[15px] font-bold uppercase tracking-wide text-[#155EEF]">Your Learning Journey</h2>

      {cards.length > 0 ? (
        <div className="space-y-4">
          {cards.map((c) => (
            <StudyPlanCard key={c.testId} {...c} />
          ))}
        </div>
      ) : (
        unplannedTest && (
          <div className="rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-[0_2px_8px_rgba(15,23,42,0.05)] dark:bg-surface-raised">
            <h3 className="mb-2 text-[15px] font-bold uppercase tracking-wide text-[#155EEF]">🎯 Set Your Study Goal</h3>
            <p className="mb-4 text-sm text-[#64748B]">
              Create a study plan and we'll calculate how many questions you should complete each day to reach your exam
              goal for {unplannedTest.title}.
            </p>
            <Link
              to={`/home/practice-tests/${unplannedTest.id}?goal=1`}
              className="inline-block rounded-lg bg-[#155EEF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#004EEB]"
            >
              Set Study Goal →
            </Link>
          </div>
        )
      )}
    </div>
  );
}

function StudyPlanCard({ testId, testTitle, testCategory, totalQuestions, minutesPerQuestion, uniqueAnsweredCount, plan }: StudyPlanCardData) {
  const uid = useAuthStore((s) => s.firebaseUser?.uid);
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const today = new Date();
  const remainingQuestions = Math.max(0, totalQuestions - uniqueAnsweredCount);
  const bankComplete = remainingQuestions === 0;

  // Non-reattempt sessions only — a reattempt re-answers already-completed
  // questions, so it isn't "new questions today" (see buildDailyAnsweredMap).
  const { data: dailyAnsweredMap } = useQuery({
    queryKey: ['student', 'streakSessions', uid, testId],
    queryFn: async () => {
      const snap = await getDocs(
        query(
          collection(db, 'practiceSessions'),
          where('userId', '==', uid),
          where('testId', '==', testId),
          where('isReattempt', '==', false)
        )
      );
      const sessions = snap.docs.map((d) => {
        const data = d.data();
        return { startedAt: toDate(data.startedAt), answeredCount: (data.answeredCount as number) ?? 0 };
      });
      return buildDailyAnsweredMap(sessions);
    },
    enabled: !!uid,
  });

  const { data: milestoneKeys } = useQuery({
    queryKey: ['student', 'studyMilestones', uid, testId],
    queryFn: async () => {
      const snap = await getDocs(
        query(collection(db, 'studyMilestones'), where('userId', '==', uid), where('testId', '==', testId))
      );
      return new Set(snap.docs.map((d) => d.data().milestoneKey as string));
    },
    enabled: !!uid,
  });

  let dailyTarget: number;
  let examColumnLabel: string;
  let examColumnValue: string;
  let examColumnSub: string;

  if (plan.planningMode === 'examDate' && plan.targetExamDate) {
    const targetExamDate = toDate(plan.targetExamDate);
    const examPlan = computeExamDatePlan({
      today,
      targetExamDate,
      totalQuestions,
      uniqueAnsweredCount,
      studyDays: plan.studyDays,
      revisionBufferDays: plan.revisionBufferDays,
      minutesPerQuestion,
    });
    dailyTarget = examPlan.dailyTarget;
    examColumnLabel = '📅 Exam Date';
    examColumnValue = targetExamDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    examColumnSub = examPlan.daysToExam >= 0 ? `${examPlan.daysToExam} Day${examPlan.daysToExam === 1 ? '' : 's'} to Go` : 'Exam date has passed';
  } else {
    dailyTarget = plan.paceQuestionsPerDay ?? questionsPerDayFromMinutes(plan.paceMinutesPerDay ?? 0, minutesPerQuestion);
    const pacePlan = computePacePlan({
      today,
      totalQuestions,
      uniqueAnsweredCount,
      studyDays: plan.studyDays,
      revisionBufferDays: plan.revisionBufferDays,
      minutesPerQuestion,
      paceQuestionsPerDay: dailyTarget,
    });
    examColumnLabel = '🏁 Suggested Exam';
    examColumnValue = pacePlan.suggestedExamDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    examColumnSub = 'at your current pace';
  }

  const streak = computeStudyStreak({
    today,
    studyDays: plan.studyDays,
    dailyTarget,
    dailyAnsweredMap: dailyAnsweredMap ?? {},
  });

  // Still computed and still recorded (the celebration toast this drives is
  // real, persisted behavior, not just decoration) even though the streak
  // number itself isn't displayed on this condensed card anymore.
  const percentComplete = totalQuestions > 0 ? Math.round((uniqueAnsweredCount / totalQuestions) * 100) : 0;
  const crossedKeys = [
    ...newlyCrossedThresholds(-1, uniqueAnsweredCount, QUESTION_MILESTONES).map((n) => `questions_${n}`),
    ...newlyCrossedThresholds(-1, percentComplete, PERCENT_MILESTONES).map((n) => `percent_${n}`),
    ...newlyCrossedThresholds(-1, streak, STREAK_MILESTONES).map((n) => `streak_${n}`),
  ];
  const undocumentedKeys = milestoneKeys ? crossedKeys.filter((k) => !milestoneKeys.has(k)) : [];

  const recordMutation = useMutation({
    mutationFn: (milestoneKey: string) => practiceSessionApi.recordMilestone(testId, milestoneKey),
    onSuccess: (data, milestoneKey) => {
      queryClient.invalidateQueries({ queryKey: ['student', 'studyMilestones', uid, testId] });
      if (data.created) pushToast(milestoneCelebrationText(milestoneKey), 'success');
    },
  });
  const attemptedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!milestoneKeys) return; // wait for real data before attempting anything
    for (const key of undocumentedKeys) {
      if (attemptedRef.current.has(key)) continue;
      attemptedRef.current.add(key);
      recordMutation.mutate(key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [milestoneKeys, undocumentedKeys.join(',')]);

  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-[0_2px_8px_rgba(15,23,42,0.05)] dark:bg-surface-raised">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">🎯 Active Goal</div>
          <div className="mt-1 text-lg font-bold text-[#0F172A]">{testTitle}</div>
          <div className="text-xs text-[#64748B]">{testCategory}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">{examColumnLabel}</div>
          <div className="mt-1 text-lg font-bold text-[#0F172A]">{examColumnValue}</div>
          <div className="text-xs text-[#64748B]">{examColumnSub}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">📚 Daily Target</div>
          {bankComplete ? (
            <div className="mt-1 text-lg font-bold text-[#16A34A]">🎉 Completed</div>
          ) : (
            <>
              <div className="mt-1 text-lg font-bold text-[#155EEF]">
                {dailyTarget} Question{dailyTarget === 1 ? '' : 's'}
              </div>
              <div className="text-xs text-[#64748B]">per day</div>
            </>
          )}
        </div>
      </div>

      <div className="mt-4 flex justify-end border-t border-[#E2E8F0] pt-3">
        <Link to={`/home/practice-tests/${testId}?goal=1`} className="text-sm font-semibold text-[#155EEF] hover:underline">
          Edit Study Plan →
        </Link>
      </div>
    </div>
  );
}
