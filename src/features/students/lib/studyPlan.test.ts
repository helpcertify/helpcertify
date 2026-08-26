import { describe, it, expect } from 'vitest';
import {
  countScheduledDaysInclusive,
  nthScheduledDate,
  computeExamDatePlan,
  computePacePlan,
  questionsPerDayFromMinutes,
  computePlanStatus,
  shouldUsePersonalPace,
  computePersonalMinutesPerQuestion,
  newlyCrossedThresholds,
  percentMilestonesCrossed,
  checkExamDateFeasibility,
  buildDailyAnsweredMap,
  computeStudyStreak,
  daysSinceLastActivity,
} from './studyPlan';
import type { StudyDaySelection } from '@/types/models';

const ALL_DAYS: StudyDaySelection = { mon: true, tue: true, wed: true, thu: true, fri: true, sat: true, sun: true };
const NO_SUNDAY: StudyDaySelection = { ...ALL_DAYS, sun: false };

describe('countScheduledDaysInclusive', () => {
  it('counts every day when all days are scheduled', () => {
    // Mon 2026-08-31 through Sun 2026-09-06 — a full week, inclusive.
    expect(countScheduledDaysInclusive(new Date(2026, 7, 31), new Date(2026, 8, 6), ALL_DAYS)).toBe(7);
  });

  it('excludes Sundays when Sunday is not a study day', () => {
    expect(countScheduledDaysInclusive(new Date(2026, 7, 31), new Date(2026, 8, 6), NO_SUNDAY)).toBe(6);
  });

  it('returns 0 for an inverted/empty range (e.g. a deadline already passed)', () => {
    expect(countScheduledDaysInclusive(new Date(2026, 8, 6), new Date(2026, 7, 31), ALL_DAYS)).toBe(0);
  });
});

describe('nthScheduledDate', () => {
  it('returns the start date itself as the 1st scheduled day when it is one', () => {
    const monday = new Date(2026, 7, 31); // a Monday
    expect(nthScheduledDate(monday, ALL_DAYS, 1).getDate()).toBe(31);
  });

  it('skips a declared rest day when counting forward', () => {
    const saturday = new Date(2026, 8, 5); // Saturday
    // 2 scheduled days from Saturday, with Sunday off: Sat (1), skip Sun, Mon (2).
    const result = nthScheduledDate(saturday, NO_SUNDAY, 2);
    expect(result.getDay()).toBe(1); // Monday
  });
});

describe('computeExamDatePlan', () => {
  it('matches the worked example shape: remaining questions drive the daily target, not the total', () => {
    const result = computeExamDatePlan({
      today: new Date(2026, 8, 17),
      targetExamDate: new Date(2026, 9, 30), // 30 Oct
      totalQuestions: 1500,
      uniqueAnsweredCount: 300,
      studyDays: ALL_DAYS,
      revisionBufferDays: 3,
      minutesPerQuestion: 1.8,
    });
    expect(result.remainingQuestions).toBe(1200);
    expect(result.practiceDeadline.getDate()).toBe(27);
    expect(result.practiceDeadline.getMonth()).toBe(9); // October (0-indexed)
    // dailyTarget = ceil(1200 / eligibleStudyDaysLeft) — eligibleStudyDaysLeft
    // is whatever countScheduledDaysInclusive(today, practiceDeadline) is;
    // assert the relationship holds rather than a hand-computed magic number.
    expect(result.dailyTarget).toBe(Math.ceil(1200 / result.eligibleStudyDaysLeft));
    expect(result.estMinutesPerDay).toBe(Math.round(result.dailyTarget * 1.8));
  });

  it('returns a 0 daily target once the bank is fully complete', () => {
    const result = computeExamDatePlan({
      today: new Date(2026, 8, 17),
      targetExamDate: new Date(2026, 9, 30),
      totalQuestions: 1500,
      uniqueAnsweredCount: 1500,
      studyDays: ALL_DAYS,
      revisionBufferDays: 3,
      minutesPerQuestion: 1.8,
    });
    expect(result.remainingQuestions).toBe(0);
    expect(result.dailyTarget).toBe(0);
  });

  it('never lets remainingQuestions go negative if the admin shrinks the bank', () => {
    const result = computeExamDatePlan({
      today: new Date(2026, 8, 17),
      targetExamDate: new Date(2026, 9, 30),
      totalQuestions: 100,
      uniqueAnsweredCount: 300, // learner had already answered more than the bank now has
      studyDays: ALL_DAYS,
      revisionBufferDays: 3,
      minutesPerQuestion: 1.8,
    });
    expect(result.remainingQuestions).toBe(0);
  });
});

describe('computePacePlan', () => {
  it('matches the worked example: 1500 questions at 50/day is 30 study days', () => {
    const result = computePacePlan({
      today: new Date(2026, 8, 1),
      totalQuestions: 1500,
      uniqueAnsweredCount: 0,
      studyDays: ALL_DAYS,
      revisionBufferDays: 3,
      minutesPerQuestion: 1.8,
      paceQuestionsPerDay: 50,
    });
    expect(result.studyDaysNeeded).toBe(30);
    expect(result.suggestedExamDate.getTime() - result.practiceCompletionDate.getTime()).toBe(3 * 86_400_000);
  });
});

describe('questionsPerDayFromMinutes', () => {
  it('converts a time budget into an approximate question count', () => {
    expect(questionsPerDayFromMinutes(60, 1.8)).toBe(Math.round(60 / 1.8));
  });
});

describe('computePlanStatus', () => {
  const baseline = {
    baselineDate: new Date(2026, 8, 1),
    baselineDailyTarget: 30,
    baselineAnsweredCount: 300,
    totalQuestions: 1500,
    studyDays: ALL_DAYS,
    currentDailyTarget: 30,
  };

  it('reports on_track when actual progress matches the expected pace', () => {
    // 5 scheduled days elapsed since baseline at 30/day = 150 expected.
    const result = computePlanStatus({ ...baseline, today: new Date(2026, 8, 6), uniqueAnsweredCount: 300 + 150 });
    expect(result.status).toBe('on_track');
  });

  it('reports ahead when the learner has done more than expected', () => {
    const result = computePlanStatus({ ...baseline, today: new Date(2026, 8, 6), uniqueAnsweredCount: 300 + 150 + 40 });
    expect(result.status).toBe('ahead');
    expect(result.deltaQuestions).toBeGreaterThan(0);
  });

  it('reports catch_up and a positive extraPerDay when behind', () => {
    const result = computePlanStatus({
      ...baseline,
      today: new Date(2026, 8, 6),
      uniqueAnsweredCount: 300 + 150 - 40,
      currentDailyTarget: 35, // recalculated target has already risen because of the gap
    });
    expect(result.status).toBe('catch_up');
    expect(result.extraPerDay).toBe(5);
  });
});

describe('shouldUsePersonalPace', () => {
  it('stays on the course default below the threshold', () => {
    expect(shouldUsePersonalPace(49)).toBe(false);
  });
  it('switches to personal pace at the threshold', () => {
    expect(shouldUsePersonalPace(50)).toBe(true);
  });
});

describe('computePersonalMinutesPerQuestion', () => {
  it('averages minutes/question across sessions', () => {
    const minutesPerQuestion = computePersonalMinutesPerQuestion([
      { startedAt: new Date(2026, 0, 1, 10, 0), submittedAt: new Date(2026, 0, 1, 10, 30), answeredCount: 20 }, // 1.5 min/q
      { startedAt: new Date(2026, 0, 2, 10, 0), submittedAt: new Date(2026, 0, 2, 10, 20), answeredCount: 10 }, // 2 min/q
    ]);
    // total 50 minutes / 30 questions
    expect(minutesPerQuestion).toBeCloseTo(50 / 30, 5);
  });

  it('returns null with no answered questions to average', () => {
    expect(computePersonalMinutesPerQuestion([])).toBeNull();
  });
});

describe('milestone thresholds', () => {
  it('detects every threshold crossed in one jump', () => {
    expect(newlyCrossedThresholds(240, 760, [100, 250, 500, 750, 1000])).toEqual([250, 500, 750]);
  });
  it('detects nothing when no threshold was crossed', () => {
    expect(newlyCrossedThresholds(260, 490, [100, 250, 500, 750, 1000])).toEqual([]);
  });
  it('detects a percent milestone crossing', () => {
    expect(percentMilestonesCrossed(48, 52)).toEqual([50]);
  });
});

describe('checkExamDateFeasibility', () => {
  it('flags a plan whose daily target implies more than the comfortable ceiling', () => {
    const result = checkExamDateFeasibility({ dailyTarget: 200, estMinutesPerDay: 360 });
    expect(result.feasible).toBe(false);
    expect(result.requiredMinutesPerDay).toBe(360);
  });
  it('accepts a plan within the comfortable ceiling', () => {
    const result = checkExamDateFeasibility({ dailyTarget: 30, estMinutesPerDay: 50 });
    expect(result.feasible).toBe(true);
  });
});

describe('buildDailyAnsweredMap', () => {
  it('sums multiple sessions on the same calendar day', () => {
    const map = buildDailyAnsweredMap([
      { startedAt: new Date(2026, 7, 31, 8, 0), answeredCount: 20 },
      { startedAt: new Date(2026, 7, 31, 20, 0), answeredCount: 15 },
      { startedAt: new Date(2026, 8, 1, 9, 0), answeredCount: 10 },
    ]);
    expect(map['2026-08-31']).toBe(35);
    expect(map['2026-09-01']).toBe(10);
  });
});

describe('computeStudyStreak', () => {
  const target = 50;

  it('counts consecutive scheduled days that met the target', () => {
    // Today is Thu 2026-09-03; Mon-Wed all met 50, all days scheduled.
    const today = new Date(2026, 8, 3);
    const map = buildDailyAnsweredMap([
      { startedAt: new Date(2026, 7, 31), answeredCount: 50 }, // Mon
      { startedAt: new Date(2026, 8, 1), answeredCount: 60 }, // Tue
      { startedAt: new Date(2026, 8, 2), answeredCount: 50 }, // Wed
    ]);
    expect(computeStudyStreak({ today, studyDays: ALL_DAYS, dailyTarget: target, dailyAnsweredMap: map })).toBe(3);
  });

  it('does not break the streak on today even if unmet yet (the day is not over)', () => {
    const today = new Date(2026, 8, 3); // Thu, nothing answered yet today
    const map = buildDailyAnsweredMap([
      { startedAt: new Date(2026, 8, 1), answeredCount: 50 }, // Tue
      { startedAt: new Date(2026, 8, 2), answeredCount: 50 }, // Wed
    ]);
    expect(computeStudyStreak({ today, studyDays: ALL_DAYS, dailyTarget: target, dailyAnsweredMap: map })).toBe(2);
  });

  it('does not break the streak on a rest day the learner never scheduled', () => {
    // NO_SUNDAY: Sunday is a rest day. Streak spans Fri/Sat, skips Sunday, continues Monday.
    const today = new Date(2026, 8, 7); // Monday
    const map = buildDailyAnsweredMap([
      { startedAt: new Date(2026, 8, 4), answeredCount: 50 }, // Fri
      { startedAt: new Date(2026, 8, 5), answeredCount: 50 }, // Sat
      // Sunday 2026-09-06 intentionally has no session at all - a rest day.
      { startedAt: new Date(2026, 8, 7), answeredCount: 50 }, // Mon
    ]);
    expect(computeStudyStreak({ today, studyDays: NO_SUNDAY, dailyTarget: target, dailyAnsweredMap: map })).toBe(3);
  });

  it('breaks the streak at the first missed scheduled day looking backward', () => {
    const today = new Date(2026, 8, 3); // Thu
    const map = buildDailyAnsweredMap([
      { startedAt: new Date(2026, 7, 31), answeredCount: 50 }, // Mon - met, but unreachable behind the miss
      // Tue 2026-09-01 missed entirely (0 answered).
      { startedAt: new Date(2026, 8, 2), answeredCount: 50 }, // Wed - met
    ]);
    expect(computeStudyStreak({ today, studyDays: ALL_DAYS, dailyTarget: target, dailyAnsweredMap: map })).toBe(1);
  });

  it('returns 0 when dailyTarget is 0 (e.g. the bank is already fully completed)', () => {
    expect(computeStudyStreak({ today: new Date(2026, 8, 3), studyDays: ALL_DAYS, dailyTarget: 0, dailyAnsweredMap: {} })).toBe(0);
  });
});

describe('daysSinceLastActivity', () => {
  it('returns null when there is no activity at all yet', () => {
    expect(daysSinceLastActivity({}, new Date(2026, 8, 3))).toBeNull();
  });

  it('returns 0 when the most recent activity was today', () => {
    const map = buildDailyAnsweredMap([{ startedAt: new Date(2026, 8, 3), answeredCount: 20 }]);
    expect(daysSinceLastActivity(map, new Date(2026, 8, 3))).toBe(0);
  });

  it('returns the real gap in calendar days since the last active day', () => {
    const map = buildDailyAnsweredMap([{ startedAt: new Date(2026, 7, 28), answeredCount: 20 }]);
    expect(daysSinceLastActivity(map, new Date(2026, 8, 3))).toBe(6);
  });

  it('ignores days recorded with zero answered (never actually true, but should not count as activity)', () => {
    const map = { '2026-08-30': 0, '2026-08-25': 15 };
    expect(daysSinceLastActivity(map, new Date(2026, 8, 3))).toBe(9);
  });
});
