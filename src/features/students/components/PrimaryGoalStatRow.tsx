import { Link } from 'react-router-dom';
import {
  computeStudyStreak,
  buildDailyAnsweredMap,
  buildDailyCorrectMap,
  sumTrailingDays,
} from '../lib/studyPlan';
import { usePrimaryGoal } from '../lib/usePrimaryGoal';

// The single-focus progress strip (Practiced / Accuracy / Study Streak /
// Today's Target + This Week's Progress) at the top of the Practice Exams
// page. Renders nothing until the learner has an active study plan (per-test
// or whole-series) with a real daily target - see usePrimaryGoal.
export function PrimaryGoalStatRow() {
  const today = new Date();
  const { goal } = usePrimaryGoal();

  const uniqueAnsweredCount = goal?.uniqueAnsweredCount ?? 0;
  const totalQuestions = goal?.totalQuestions ?? 0;
  const dailyTarget = goal?.dailyTarget ?? 0;

  const dailyAnsweredMap = buildDailyAnsweredMap(goal?.sessions ?? []);
  const dailyCorrectMap = buildDailyCorrectMap(goal?.sessions ?? []);
  const thisWeekAnswered = sumTrailingDays(dailyAnsweredMap, today, 7);
  const thisWeekCorrect = sumTrailingDays(dailyCorrectMap, today, 7);
  const lastWeekAnswered = sumTrailingDays(dailyAnsweredMap, today, 7, 7);
  const lastWeekCorrect = sumTrailingDays(dailyCorrectMap, today, 7, 7);
  const weeklyAccuracy = thisWeekAnswered > 0 ? Math.round((thisWeekCorrect / thisWeekAnswered) * 100) : null;
  const lastWeekAccuracy = lastWeekAnswered > 0 ? Math.round((lastWeekCorrect / lastWeekAnswered) * 100) : null;
  const accuracyDelta = weeklyAccuracy !== null && lastWeekAccuracy !== null ? weeklyAccuracy - lastWeekAccuracy : null;
  const weeklyQuestionsDelta =
    lastWeekAnswered > 0 ? Math.round(((thisWeekAnswered - lastWeekAnswered) / lastWeekAnswered) * 100) : null;
  const studyStreak = goal
    ? computeStudyStreak({ today, studyDays: goal.plan.studyDays, dailyTarget, dailyAnsweredMap })
    : 0;

  if (!goal) return null;

  return (
    <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          icon="📚"
          value={`${uniqueAnsweredCount} / ${totalQuestions}`}
          valueColor="#0F172A"
          label="Practiced"
          sub={`${Math.max(0, totalQuestions - uniqueAnsweredCount)} questions remaining`}
        />
        <StatCard
          icon="📈"
          value={weeklyAccuracy !== null ? `${weeklyAccuracy}%` : '-'}
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
