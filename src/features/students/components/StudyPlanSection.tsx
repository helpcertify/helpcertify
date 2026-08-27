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
  computePlanStatus,
  questionsPerDayFromMinutes,
  buildDailyAnsweredMap,
  computeStudyStreak,
  daysSinceLastActivity,
  newlyCrossedThresholds,
  dateKey,
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

// The Home dashboard's "Today's Target" section (Study Planner Phase 1,
// step 3) — one card per practice test the learner has an active plan for.
// Every number here is recomputed live from the plan + current progress
// (see studyPlan.ts's header comment for why nothing is cached), so an admin
// changing the bank size, or a learner missing/exceeding a day, is reflected
// the moment this renders rather than on some later resync.
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
    <div className="mb-8">
      <h2 className="mb-3 text-lg font-bold text-ink">My Study Plan</h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {cards.map((c) => (
          <StudyPlanCard key={c.testId} {...c} />
        ))}
      </div>
      {cards.length === 0 && unplannedTest && (
        <div className="rounded-xl border border-dashed border-surface-border p-5 text-center">
          <p className="mb-3 text-sm text-ink-faint">
            Set a study goal for {unplannedTest.title} to see your daily target and progress here.
          </p>
          <Link
            to={`/home/practice-tests/${unplannedTest.id}?goal=1`}
            className="inline-block rounded-lg bg-[#1D4ED8] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            🎯 Set My Study Goal
          </Link>
        </div>
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
  const percentComplete = totalQuestions > 0 ? Math.round((uniqueAnsweredCount / totalQuestions) * 100) : 0;
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
  let countdownLabel: string;
  let examDatePassed = false;

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
    examDatePassed = examPlan.daysToExam < 0;
    countdownLabel = examDatePassed
      ? 'Your exam date has passed. Update your plan to keep going.'
      : `📅 ${examPlan.daysToExam} day${examPlan.daysToExam === 1 ? '' : 's'} to exam · practice deadline ${examPlan.practiceDeadline.toLocaleDateString()}`;
  } else {
    dailyTarget =
      plan.paceQuestionsPerDay ?? questionsPerDayFromMinutes(plan.paceMinutesPerDay ?? 0, minutesPerQuestion);
    const pacePlan = computePacePlan({
      today,
      totalQuestions,
      uniqueAnsweredCount,
      studyDays: plan.studyDays,
      revisionBufferDays: plan.revisionBufferDays,
      minutesPerQuestion,
      paceQuestionsPerDay: dailyTarget,
    });
    countdownLabel = `🏁 Suggested exam date: ${pacePlan.suggestedExamDate.toLocaleDateString()}`;
  }

  const status = computePlanStatus({
    today,
    baselineDate: toDate(plan.baselineDate),
    baselineDailyTarget: plan.baselineDailyTarget,
    baselineAnsweredCount: plan.baselineAnsweredCount,
    uniqueAnsweredCount,
    totalQuestions,
    studyDays: plan.studyDays,
    currentDailyTarget: dailyTarget,
  });

  const statusChip =
    status.status === 'ahead'
      ? { label: `✅ Ahead by ${status.deltaQuestions}`, className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' }
      : status.status === 'catch_up'
        ? { label: `🟡 +${status.extraPerDay}/day to catch up`, className: 'bg-[#d87f1d]/15 text-[#d87f1d]' }
        : { label: '🟢 On track', className: 'bg-[#1D4ED8]/15 text-[#1D4ED8]' };

  const streak = computeStudyStreak({
    today,
    studyDays: plan.studyDays,
    dailyTarget,
    dailyAnsweredMap: dailyAnsweredMap ?? {},
  });
  const answeredToday = (dailyAnsweredMap ?? {})[dateKey(today)] ?? 0;
  const todaysGoalComplete = !bankComplete && dailyTarget > 0 && answeredToday >= dailyTarget;

  // Every threshold at or below the current value that has no studyMilestones
  // doc yet is "newly reached" — reusing newlyCrossedThresholds with a -1
  // floor rather than tracking a separate previous-value in state, since a
  // big batch crossing several thresholds at once still needs all of them.
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

  // A missed-day gap (not just being slightly under pace every day) is what
  // makes this a genuine "welcome back" moment rather than routine catch-up
  // encouragement — a learner who's simply been studying a bit slower than
  // target every single day never actually went away, so they get the plain
  // catch-up sentence instead of a "you were gone" framing that isn't true.
  const gapDays = daysSinceLastActivity(dailyAnsweredMap ?? {}, today);
  const isRecoveryMoment = status.status === 'catch_up' && gapDays !== null && gapDays >= 2;

  const insight = bankComplete
    ? `You've completed all ${totalQuestions} questions in ${testTitle}. Amazing work.`
    : examDatePassed
      ? `You've answered ${uniqueAnsweredCount} of ${totalQuestions} questions in ${testTitle}. Pick a new exam date to keep your plan current.`
      : status.status === 'ahead'
        ? `You're ${status.deltaQuestions} question${status.deltaQuestions === 1 ? '' : 's'} ahead of pace on ${testTitle}. Keep it up.`
        : status.status === 'catch_up'
          ? `Add about ${status.extraPerDay} more question${status.extraPerDay === 1 ? '' : 's'} per study day this week to get back on track with ${testTitle}.`
          : `You're right on track with ${testTitle}, ${percentComplete}% complete.`;

  return (
    <div className="flex h-full flex-col rounded-xl border border-surface-border bg-surface-raised p-5">
      <div className="mb-1 flex items-start justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-wide text-ink-faint">{testCategory}</div>
          <h3 className="font-bold text-ink">{testTitle}</h3>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusChip.className}`}>{statusChip.label}</span>
          {streak > 0 && (
            <span className="rounded-full bg-[#d87f1d]/15 px-2.5 py-1 text-xs font-medium text-[#d87f1d]">
              🔥 {streak} day{streak === 1 ? '' : 's'} streak
            </span>
          )}
        </div>
      </div>

      <p className="mb-3 text-xs text-ink-faint">{countdownLabel}</p>

      <div className="mb-1 flex items-center justify-between text-xs text-ink-faint">
        <span>
          {uniqueAnsweredCount} / {totalQuestions} questions
        </span>
        <span>{percentComplete}%</span>
      </div>
      <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-surface">
        <div className="h-full rounded-full bg-[#1D4ED8]" style={{ width: `${Math.min(100, percentComplete)}%` }} />
      </div>

      {bankComplete ? (
        <div className="rounded-lg bg-emerald-500/10 px-3 py-2.5 text-center text-sm font-medium text-emerald-700 dark:text-emerald-400">
          🎉 Today's Goal Complete. Question bank finished.
        </div>
      ) : (
        <>
          <div className="mb-3 rounded-lg bg-surface p-3.5 text-center">
            <div className="text-xs uppercase tracking-wide text-ink-faint">Today's Target</div>
            <div className="text-2xl font-bold text-ink">{dailyTarget} question{dailyTarget === 1 ? '' : 's'}</div>
            {answeredToday > 0 && <div className="mt-1 text-xs text-ink-faint">{answeredToday} answered today</div>}
          </div>
          {todaysGoalComplete ? (
            <div className="rounded-lg bg-emerald-500/10 px-3 py-2.5 text-center text-sm font-medium text-emerald-700 dark:text-emerald-400">
              🎉 Today's Goal Complete. Great work.
            </div>
          ) : (
            <Link
              to={`/practice-tests/${testId}/take`}
              className="block rounded-lg bg-[#1D4ED8] py-2.5 text-center text-sm font-medium text-white hover:opacity-90"
            >
              Start Today's Session →
            </Link>
          )}
        </>
      )}

      {isRecoveryMoment ? (
        <div className="mt-3 rounded-lg border border-[#d87f1d]/30 bg-[#d87f1d]/10 p-3 text-xs text-ink">
          <span className="font-semibold">Welcome back.</span> It's been {gapDays} days since your last session on{' '}
          {testTitle}. Your plan has recalculated automatically: complete {status.extraPerDay} additional question
          {status.extraPerDay === 1 ? '' : 's'} per study day this week and you'll be right back on schedule.
        </div>
      ) : (
        <p className="mt-3 text-xs text-ink-muted">{insight}</p>
      )}
    </div>
  );
}
