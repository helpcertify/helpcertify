import type { StudyDaySelection } from '@/types/models';

// Personal Study Planner (Phase 1) — pure calculation engine, no I/O.
// Deliberately kept side-effect-free and framework-free so every formula
// here is unit-testable in isolation against the worked examples in the
// approved proposal, and so the same functions can run identically on the
// dashboard (read-heavy) and the goal-setup form (what-if preview before
// saving). Every "today"/date argument is expected to already represent the
// correct local calendar day for the learner (i.e. constructed from a
// Date that's already been shifted into their timezone) — this module does
// no timezone conversion itself, only calendar-day arithmetic on whatever
// Date it's given.

const WEEKDAY_KEYS: (keyof StudyDaySelection)[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function weekdayKey(date: Date): keyof StudyDaySelection {
  return WEEKDAY_KEYS[date.getDay()];
}

export function isScheduledDay(date: Date, studyDays: StudyDaySelection): boolean {
  return studyDays[weekdayKey(date)];
}

// Whole calendar days from `from` to `to` (can be negative if `to` is
// earlier). Both are normalized to local midnight first so partial-day
// differences never produce an off-by-one.
export function calendarDaysBetween(from: Date, to: Date): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / MS_PER_DAY);
}

// Counts scheduled-weekday days in [from, to], both inclusive. Returns 0 if
// the range is empty/inverted (e.g. a practice deadline that's already
// passed) rather than a negative count — a negative "days available" has
// no sensible meaning downstream.
export function countScheduledDaysInclusive(from: Date, to: Date, studyDays: StudyDaySelection): number {
  const span = calendarDaysBetween(from, to);
  if (span < 0) return 0;
  let count = 0;
  let cursor = startOfDay(from);
  for (let i = 0; i <= span; i++) {
    if (isScheduledDay(cursor, studyDays)) count++;
    cursor = addDays(cursor, 1);
  }
  return count;
}

// The date of the Nth scheduled day starting from `from` (inclusive) — e.g.
// n=1 is the first scheduled day on/after `from`, which may be `from`
// itself if it's a study day. Used to turn "30 study days needed" into an
// actual calendar date (the pace-mode practice-completion date).
export function nthScheduledDate(from: Date, studyDays: StudyDaySelection, n: number): Date {
  if (n <= 0) return startOfDay(from);
  let remaining = n;
  let cursor = startOfDay(from);
  // Bounded to a generous 10 years of calendar days so a pathological
  // all-false studyDays selection can never spin forever.
  for (let i = 0; i < 3660; i++) {
    if (isScheduledDay(cursor, studyDays)) {
      remaining--;
      if (remaining === 0) return cursor;
    }
    cursor = addDays(cursor, 1);
  }
  return cursor;
}

// ---------------------------------------------------------------------------
// Option A — I Have an Exam Date
// ---------------------------------------------------------------------------

export interface ExamDatePlanInputs {
  today: Date;
  targetExamDate: Date;
  totalQuestions: number;
  uniqueAnsweredCount: number;
  studyDays: StudyDaySelection;
  revisionBufferDays: number;
  minutesPerQuestion: number;
}

export interface ExamDatePlanResult {
  daysToExam: number;
  practiceDeadline: Date;
  revisionStart: Date;
  eligibleStudyDaysLeft: number;
  remainingQuestions: number;
  dailyTarget: number;
  estMinutesPerDay: number;
}

export function computeExamDatePlan(inputs: ExamDatePlanInputs): ExamDatePlanResult {
  const { today, targetExamDate, totalQuestions, uniqueAnsweredCount, studyDays, revisionBufferDays, minutesPerQuestion } = inputs;
  const daysToExam = calendarDaysBetween(today, targetExamDate);
  const practiceDeadline = addDays(startOfDay(targetExamDate), -revisionBufferDays);
  const revisionStart = addDays(practiceDeadline, 1);
  const eligibleStudyDaysLeft = countScheduledDaysInclusive(today, practiceDeadline, studyDays);
  const remainingQuestions = Math.max(0, totalQuestions - uniqueAnsweredCount);
  const dailyTarget = remainingQuestions === 0 ? 0 : Math.ceil(remainingQuestions / Math.max(1, eligibleStudyDaysLeft));
  const estMinutesPerDay = Math.round(dailyTarget * minutesPerQuestion);
  return { daysToExam, practiceDeadline, revisionStart, eligibleStudyDaysLeft, remainingQuestions, dailyTarget, estMinutesPerDay };
}

// ---------------------------------------------------------------------------
// Option B — Plan At My Pace
// ---------------------------------------------------------------------------

export interface PacePlanInputs {
  today: Date;
  totalQuestions: number;
  uniqueAnsweredCount: number;
  studyDays: StudyDaySelection;
  revisionBufferDays: number;
  minutesPerQuestion: number;
  // Already resolved to a questions/day number — see
  // questionsPerDayFromMinutes for converting a time-based input first.
  paceQuestionsPerDay: number;
}

export interface PacePlanResult {
  remainingQuestions: number;
  studyDaysNeeded: number;
  practiceCompletionDate: Date;
  suggestedExamDate: Date;
  estMinutesPerDay: number;
}

export function computePacePlan(inputs: PacePlanInputs): PacePlanResult {
  const { today, totalQuestions, uniqueAnsweredCount, studyDays, revisionBufferDays, minutesPerQuestion, paceQuestionsPerDay } = inputs;
  const remainingQuestions = Math.max(0, totalQuestions - uniqueAnsweredCount);
  const studyDaysNeeded = remainingQuestions === 0 ? 0 : Math.ceil(remainingQuestions / Math.max(1, paceQuestionsPerDay));
  const practiceCompletionDate = studyDaysNeeded === 0 ? startOfDay(today) : nthScheduledDate(today, studyDays, studyDaysNeeded);
  const suggestedExamDate = addDays(practiceCompletionDate, revisionBufferDays);
  const estMinutesPerDay = Math.round(paceQuestionsPerDay * minutesPerQuestion);
  return { remainingQuestions, studyDaysNeeded, practiceCompletionDate, suggestedExamDate, estMinutesPerDay };
}

// A learner picking a time budget instead of a question count (§8) — this
// is the one conversion point between the two, used both to preview a
// pace plan and to re-express an exam-date plan's daily target as minutes.
export function questionsPerDayFromMinutes(minutesPerDay: number, minutesPerQuestion: number): number {
  if (minutesPerQuestion <= 0) return 0;
  return Math.round(minutesPerDay / minutesPerQuestion);
}

// ---------------------------------------------------------------------------
// Ahead / on-track / catch-up
// ---------------------------------------------------------------------------

export type PlanStatus = 'ahead' | 'on_track' | 'catch_up';

export interface PlanStatusInputs {
  today: Date;
  baselineDate: Date;
  baselineDailyTarget: number;
  baselineAnsweredCount: number;
  uniqueAnsweredCount: number;
  totalQuestions: number;
  studyDays: StudyDaySelection;
  currentDailyTarget: number;
  // Small buffer so a 1-question rounding difference doesn't flip the
  // status back and forth around zero. Default matches the proposal's
  // "small tolerance" note in §D.
  tolerance?: number;
}

export interface PlanStatusResult {
  status: PlanStatus;
  // Positive when ahead, positive-magnitude when behind — always read
  // together with `status` rather than by sign alone.
  deltaQuestions: number;
  // Only meaningful when status is 'catch_up' — how many more questions per
  // scheduled day would close the gap by the practice deadline.
  extraPerDay: number;
}

export function computePlanStatus(inputs: PlanStatusInputs): PlanStatusResult {
  const {
    today,
    baselineDate,
    baselineDailyTarget,
    baselineAnsweredCount,
    uniqueAnsweredCount,
    totalQuestions,
    studyDays,
    currentDailyTarget,
    tolerance = 1,
  } = inputs;

  // Scheduled days strictly between the baseline and today — today itself
  // isn't "expected" yet since the day isn't over.
  const scheduledDaysElapsed =
    calendarDaysBetween(baselineDate, today) <= 0 ? 0 : countScheduledDaysInclusive(baselineDate, addDays(today, -1), studyDays);

  const expectedByNow = Math.min(totalQuestions, baselineAnsweredCount + scheduledDaysElapsed * baselineDailyTarget);
  const delta = uniqueAnsweredCount - expectedByNow;

  if (delta > tolerance) return { status: 'ahead', deltaQuestions: delta, extraPerDay: 0 };
  if (delta < -tolerance) {
    return { status: 'catch_up', deltaQuestions: delta, extraPerDay: Math.max(0, currentDailyTarget - baselineDailyTarget) };
  }
  return { status: 'on_track', deltaQuestions: delta, extraPerDay: 0 };
}

// ---------------------------------------------------------------------------
// Personal pace (§9)
// ---------------------------------------------------------------------------

// Below this many unique answered questions, a learner's own timing is too
// noisy to trust (a slow first few questions while getting oriented would
// badly skew a tiny sample) — the course's own default is used instead.
// Chosen so it kicks in well within a first week of normal study at almost
// any pace, while still being large enough for outliers to average out.
export const PERSONAL_PACE_MIN_ANSWERED = 50;

export function shouldUsePersonalPace(uniqueAnsweredCount: number): boolean {
  return uniqueAnsweredCount >= PERSONAL_PACE_MIN_ANSWERED;
}

export interface SessionTiming {
  startedAt: Date;
  submittedAt: Date;
  answeredCount: number;
}

// Average minutes/question across a learner's own submitted sessions for a
// test — reattempts included on purpose (this is about typical answering
// speed, not first-pass progress, so there's no reason to exclude them the
// way unique-progress counting does). Returns null if there's nothing to
// average yet.
export function computePersonalMinutesPerQuestion(sessions: SessionTiming[]): number | null {
  let totalMs = 0;
  let totalAnswered = 0;
  for (const s of sessions) {
    if (s.answeredCount <= 0) continue;
    totalMs += s.submittedAt.getTime() - s.startedAt.getTime();
    totalAnswered += s.answeredCount;
  }
  if (totalAnswered === 0) return null;
  return totalMs / totalAnswered / 60_000;
}

// ---------------------------------------------------------------------------
// Feasibility check (§11)
// ---------------------------------------------------------------------------

export interface FeasibilityResult {
  feasible: boolean;
  requiredQuestionsPerDay: number;
  requiredMinutesPerDay: number;
}

// Flags an exam-date plan whose implied daily workload is unreasonably
// high, rather than rejecting it outright — the caller decides what to
// show (the proposal's constructive message + adjustment options), this
// just supplies the numbers. `comfortableMinutesPerDay` is the ceiling past
// which a plan is considered to need adjustment; 120 (2 hours/day) is a
// reasonable default for a "comfortable" study plan, distinct from what
// anyone could technically grind through.
export function checkExamDateFeasibility(
  plan: Pick<ExamDatePlanResult, 'estMinutesPerDay' | 'dailyTarget'>,
  comfortableMinutesPerDay = 120
): FeasibilityResult {
  return {
    feasible: plan.estMinutesPerDay <= comfortableMinutesPerDay,
    requiredQuestionsPerDay: plan.dailyTarget,
    requiredMinutesPerDay: plan.estMinutesPerDay,
  };
}

// ---------------------------------------------------------------------------
// Milestones (§21, §F)
// ---------------------------------------------------------------------------

export const QUESTION_MILESTONES = [100, 250, 500, 750, 1000, 1250, 1500] as const;
export const PERCENT_MILESTONES = [25, 50, 75, 100] as const;
export const STREAK_MILESTONES = [3, 7, 14, 30] as const;

// Returns milestone keys newly crossed by going from `previousCount` to
// `currentCount` (for questions or streak-days alike) — a jump of several
// at once (e.g. a big batch submit crossing both 250 and the next one some
// day) still returns every threshold crossed, not just the nearest one.
export function newlyCrossedThresholds(previousCount: number, currentCount: number, thresholds: readonly number[]): number[] {
  return thresholds.filter((t) => previousCount < t && currentCount >= t);
}

export function percentMilestonesCrossed(previousPercent: number, currentPercent: number): number[] {
  return newlyCrossedThresholds(previousPercent, currentPercent, PERCENT_MILESTONES);
}
