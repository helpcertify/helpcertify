import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { listPracticeTestsBucketed } from '../api/studentContentApi';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { toDate } from '@/utils/formatDate';
import {
  computeExamDatePlan,
  questionsPerDayFromMinutes,
  calendarDaysBetween,
  computeStudyStreak,
  buildDailyAnsweredMap,
  buildDailyCorrectMap,
  sumTrailingDays,
} from '../lib/studyPlan';
import type { StudyPlanDoc } from '@/types/models';

// The single-focus progress strip (Practiced / Accuracy / Study Streak /
// Today's Target + This Week's Progress) that used to sit on the home page.
// Moved to the top of the Practice Exams page. Self-contained: it runs its
// own queries — react-query dedupes the shared ones (study plans, practice
// progress, the practice-test buckets) with the host page. Renders nothing
// until the learner has an active study plan with a real daily target.
export function PrimaryGoalStatRow() {
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

  const anyTestById = new Map(
    [...(buckets?.available ?? []), ...(buckets?.upcoming ?? []), ...(buckets?.expired ?? [])].map((t) => [t.id, t]),
  );

  const plansWithTest = (studyPlans ?? []).filter((p) => anyTestById.has(p.testId));
  const examDatePlans = plansWithTest
    .filter((p) => p.planningMode === 'examDate' && p.targetExamDate)
    .map((p) => ({ plan: p, daysToExam: calendarDaysBetween(today, toDate(p.targetExamDate)) }))
    .filter((p) => p.daysToExam >= 0)
    .sort((a, b) => a.daysToExam - b.daysToExam);
  const primaryPlan = examDatePlans[0]?.plan ?? plansWithTest[0] ?? null;
  const primaryTest = primaryPlan ? anyTestById.get(primaryPlan.testId) ?? null : null;

  const primaryProgress = primaryTest ? (progressDocs ?? []).find((p) => p.testId === primaryTest.id) : undefined;
  const uniqueAnsweredCount = primaryProgress?.answeredQuestionIds.length ?? 0;

  const { data: primarySessions } = useQuery({
    queryKey: ['student', 'primaryGoalSessions', uid, primaryTest?.id],
    queryFn: async () => {
      const snap = await getDocs(
        query(
          collection(db, 'practiceSessions'),
          where('userId', '==', uid),
          where('testId', '==', primaryTest!.id),
          where('isReattempt', '==', false),
        ),
      );
      return snap.docs.map((d) => {
        const data = d.data();
        return {
          startedAt: toDate(data.startedAt),
          answeredCount: (data.answeredCount as number) ?? 0,
          correctCount: (data.correctCount as number) ?? 0,
        };
      });
    },
    enabled: !!uid && !!primaryTest,
  });

  const minutesPerQuestion = primaryTest?.defaultMinutesPerQuestion ?? 1.8;
  let dailyTarget = 0;
  if (primaryPlan && primaryTest) {
    if (primaryPlan.planningMode === 'examDate' && primaryPlan.targetExamDate) {
      dailyTarget = computeExamDatePlan({
        today,
        targetExamDate: toDate(primaryPlan.targetExamDate),
        totalQuestions: primaryTest.totalQuestions,
        uniqueAnsweredCount,
        studyDays: primaryPlan.studyDays,
        revisionBufferDays: primaryPlan.revisionBufferDays,
        minutesPerQuestion,
      }).dailyTarget;
    } else {
      dailyTarget =
        primaryPlan.paceQuestionsPerDay ?? questionsPerDayFromMinutes(primaryPlan.paceMinutesPerDay ?? 0, minutesPerQuestion);
    }
  }

  const dailyAnsweredMap = buildDailyAnsweredMap(primarySessions ?? []);
  const dailyCorrectMap = buildDailyCorrectMap(primarySessions ?? []);
  const thisWeekAnswered = sumTrailingDays(dailyAnsweredMap, today, 7);
  const thisWeekCorrect = sumTrailingDays(dailyCorrectMap, today, 7);
  const lastWeekAnswered = sumTrailingDays(dailyAnsweredMap, today, 7, 7);
  const lastWeekCorrect = sumTrailingDays(dailyCorrectMap, today, 7, 7);
  const weeklyAccuracy = thisWeekAnswered > 0 ? Math.round((thisWeekCorrect / thisWeekAnswered) * 100) : null;
  const lastWeekAccuracy = lastWeekAnswered > 0 ? Math.round((lastWeekCorrect / lastWeekAnswered) * 100) : null;
  const accuracyDelta = weeklyAccuracy !== null && lastWeekAccuracy !== null ? weeklyAccuracy - lastWeekAccuracy : null;
  const weeklyQuestionsDelta =
    lastWeekAnswered > 0 ? Math.round(((thisWeekAnswered - lastWeekAnswered) / lastWeekAnswered) * 100) : null;
  const studyStreak = primaryPlan
    ? computeStudyStreak({ today, studyDays: primaryPlan.studyDays, dailyTarget, dailyAnsweredMap })
    : 0;

  if (!(primaryPlan && primaryTest && dailyTarget > 0)) return null;

  return (
    <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          icon="📚"
          value={`${uniqueAnsweredCount} / ${primaryTest.totalQuestions}`}
          valueColor="#0F172A"
          label="Practiced"
          sub={`${Math.max(0, primaryTest.totalQuestions - uniqueAnsweredCount)} questions remaining`}
        />
        <StatCard
          icon="📈"
          value={weeklyAccuracy !== null ? `${weeklyAccuracy}%` : '—'}
          valueColor="#16A34A"
          label="Accuracy"
          sub={
            accuracyDelta === null
              ? 'This week'
              : accuracyDelta >= 0
                ? `↑ ${accuracyDelta}% this week`
                : `↓ ${Math.abs(accuracyDelta)}% this week`
          }
          subColor={accuracyDelta !== null && accuracyDelta < 0 ? '#DC2626' : '#16A34A'}
        />
        <StatCard
          icon="🔥"
          value={`${studyStreak} Day${studyStreak === 1 ? '' : 's'}`}
          valueColor="#D87F1D"
          label="Study Streak"
          sub={studyStreak > 0 ? 'Keep it going!' : 'Start today'}
        />
        <StatCard icon="🎯" value={String(dailyTarget)} valueColor="#7C3AED" label="Today's Target" sub="Daily goal" />
      </div>

      <Link
        to="/home/profile"
        className="flex h-full flex-col rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-[0_2px_8px_rgba(15,23,42,0.04)] transition-colors hover:border-[#B9CEFF] dark:bg-surface-raised"
      >
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold uppercase tracking-wide text-[#64748B]">This Week's Progress</div>
          <span className="text-xs font-medium text-[#155EEF]">View Details →</span>
        </div>
        {weeklyQuestionsDelta !== null && (
          <div className={`mt-3 text-lg font-bold ${weeklyQuestionsDelta >= 0 ? 'text-[#16A34A]' : 'text-[#EA580C]'}`}>
            {weeklyQuestionsDelta >= 0 ? '↑' : '↓'} {Math.abs(weeklyQuestionsDelta)}%{' '}
            <span className="text-xs font-medium text-[#64748B]">vs last week</span>
          </div>
        )}
      </Link>
    </div>
  );
}

function StatCard({
  icon,
  value,
  valueColor,
  label,
  sub,
  subColor,
}: {
  icon: string;
  value: string;
  valueColor: string;
  label: string;
  sub: string;
  subColor?: string;
}) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-[0_2px_8px_rgba(15,23,42,0.04)] dark:bg-surface-raised">
      <div className="mb-1 text-xl" aria-hidden="true">
        {icon}
      </div>
      <div className="text-lg font-bold" style={{ color: valueColor }}>
        {value}
      </div>
      <div className="text-xs text-[#64748B]">{label}</div>
      <div className="mt-1 text-[11px]" style={{ color: subColor ?? '#94A3B8' }}>
        {sub}
      </div>
    </div>
  );
}
