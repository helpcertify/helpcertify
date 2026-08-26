import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getPracticeTestById } from '../api/studentContentApi';
import { getStudyPlan } from '../api/studyPlanApi';
import { practiceSessionApi } from '../api/practiceSessionApi';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { useUiStore } from '@/store/useUiStore';
import {
  computeExamDatePlan,
  computePacePlan,
  questionsPerDayFromMinutes,
  checkExamDateFeasibility,
} from '../lib/studyPlan';
import { ALL_STUDY_DAYS } from '@/types/models';
import type { StudyDaySelection, StudyPlanningMode } from '@/types/models';

const STUDY_DAY_LABELS: { key: keyof StudyDaySelection; label: string }[] = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];

const QUESTIONS_PER_DAY_PRESETS = [25, 50, 75, 100];
const MINUTES_PER_DAY_PRESETS = [30, 45, 60, 90, 120];

function formatDisplayDate(d: Date): string {
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

// Goal-setup flow (Phase 1 Study Planner, step 2 of the approved proposal):
// "I Have an Exam Date" and "Plan At My Pace" both collapse into the same
// live preview + save action, just with different inputs feeding the same
// calculation engine (src/features/students/lib/studyPlan.ts) — one visual
// language for both entry points rather than two different result screens.
export function StudyPlanSetupPage() {
  const { testId } = useParams<{ testId: string }>();
  const uid = useAuthStore((s) => s.firebaseUser?.uid);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);

  const { data: test } = useQuery({
    queryKey: ['student', 'practiceTest', testId],
    queryFn: () => getPracticeTestById(testId!),
    enabled: !!testId,
  });
  const { data: existingPlan } = useQuery({
    queryKey: ['student', 'studyPlan', uid, testId],
    queryFn: () => getStudyPlan(uid!, testId!),
    enabled: !!uid && !!testId,
  });
  const { data: progress } = useQuery({
    queryKey: ['student', 'practiceProgressOne', uid, testId],
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'practiceProgress', `${uid}_${testId}`));
      return snap.exists() ? (snap.data().answeredQuestionIds as string[]).length : 0;
    },
    enabled: !!uid && !!testId,
  });

  type Step = 'choose' | 'examDate' | 'pace';
  const [step, setStep] = useState<Step>('choose');
  const [studyDays, setStudyDays] = useState<StudyDaySelection>(ALL_STUDY_DAYS);
  const [examDate, setExamDate] = useState('');
  const [paceInputKind, setPaceInputKind] = useState<'questions' | 'minutes'>('questions');
  const [questionsPerDay, setQuestionsPerDay] = useState(50);
  const [customQuestions, setCustomQuestions] = useState('');
  const [minutesPerDay, setMinutesPerDay] = useState(60);
  const [customMinutes, setCustomMinutes] = useState('');

  const totalQuestions = test?.totalQuestions ?? 0;
  const uniqueAnsweredCount = progress ?? 0;
  const revisionBufferDays = test?.revisionBufferDays ?? 3;
  const minutesPerQuestion = test?.defaultMinutesPerQuestion ?? 1.8;
  const today = useMemo(() => new Date(), []);

  const examDatePreview = useMemo(() => {
    if (!examDate) return null;
    return computeExamDatePlan({
      today,
      targetExamDate: new Date(examDate),
      totalQuestions,
      uniqueAnsweredCount,
      studyDays,
      revisionBufferDays,
      minutesPerQuestion,
    });
  }, [examDate, today, totalQuestions, uniqueAnsweredCount, studyDays, revisionBufferDays, minutesPerQuestion]);

  const resolvedQuestionsPerDay =
    paceInputKind === 'questions'
      ? Number(customQuestions) || questionsPerDay
      : questionsPerDayFromMinutes(Number(customMinutes) || minutesPerDay, minutesPerQuestion);

  const pacePreview = useMemo(() => {
    if (resolvedQuestionsPerDay <= 0) return null;
    return computePacePlan({
      today,
      totalQuestions,
      uniqueAnsweredCount,
      studyDays,
      revisionBufferDays,
      minutesPerQuestion,
      paceQuestionsPerDay: resolvedQuestionsPerDay,
    });
  }, [resolvedQuestionsPerDay, today, totalQuestions, uniqueAnsweredCount, studyDays, revisionBufferDays, minutesPerQuestion]);

  const feasibility = examDatePreview ? checkExamDateFeasibility(examDatePreview) : null;

  const saveMutation = useMutation({
    mutationFn: async (mode: StudyPlanningMode) => {
      const baselineDailyTarget = mode === 'examDate' ? (examDatePreview?.dailyTarget ?? 0) : resolvedQuestionsPerDay;
      return practiceSessionApi.saveStudyPlan({
        testId: testId!,
        planningMode: mode,
        targetExamDate: mode === 'examDate' ? new Date(examDate).toISOString() : null,
        paceQuestionsPerDay: mode === 'pace' ? resolvedQuestionsPerDay : null,
        paceMinutesPerDay: mode === 'pace' && paceInputKind === 'minutes' ? Number(customMinutes) || minutesPerDay : null,
        studyDays,
        baselineDailyTarget,
      });
    },
    onSuccess: () => {
      pushToast('Study plan saved', 'success');
      queryClient.invalidateQueries({ queryKey: ['student', 'studyPlan', uid, testId] });
      navigate(`/home/practice-tests/${testId}`);
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : 'Could not save your plan', 'error'),
  });

  const toggleDay = (key: keyof StudyDaySelection) => setStudyDays((prev) => ({ ...prev, [key]: !prev[key] }));

  if (!test) return <p className="text-sm text-ink-faint">Loading…</p>;

  return (
    <div className="mx-auto max-w-5xl">
      <Link to={`/home/practice-tests/${testId}`} className="mb-4 inline-block text-sm text-brand-ink hover:underline">
        ← Back to {test.title}
      </Link>

      {/* Colorful hero banner, matching the app's own two accents (brand
          blue + amber) instead of a plain heading — this page is a single
          focused flow, so it can afford one deliberate splash of color at
          the top rather than the muted-gray treatment most list/detail
          pages use. */}
      <div className="mb-6 rounded-2xl bg-gradient-to-br from-[#1D4ED8] to-[#0f2f8f] p-6 text-white">
        <h1 className="mb-1 text-2xl font-bold">🎯 Set Your Study Goal</h1>
        <p className="text-sm text-white/80">
          {existingPlan
            ? 'You already have a plan for this practice test. Choosing an option below replaces it.'
            : "You don't need to know your exam date to get started."}
        </p>
      </div>

      {step === 'choose' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <button
            type="button"
            onClick={() => setStep('examDate')}
            className="rounded-2xl border-2 border-[#1D4ED8]/30 bg-[#1D4ED8]/5 p-6 text-left transition-colors hover:border-[#1D4ED8] hover:bg-[#1D4ED8]/10"
          >
            <div className="mb-2 text-3xl">📅</div>
            <div className="mb-1 text-lg font-semibold text-[#1D4ED8]">I Have an Exam Date</div>
            <p className="text-sm text-ink-faint">Tell us your exam date and we'll calculate what you need to complete each day.</p>
          </button>
          <button
            type="button"
            onClick={() => setStep('pace')}
            className="rounded-2xl border-2 border-[#d87f1d]/30 bg-[#d87f1d]/5 p-6 text-left transition-colors hover:border-[#d87f1d] hover:bg-[#d87f1d]/10"
          >
            <div className="mb-2 text-3xl">🏃</div>
            <div className="mb-1 text-lg font-semibold text-[#d87f1d]">Plan At My Pace</div>
            <p className="text-sm text-ink-faint">Tell us how much you can study each day and we'll estimate when you'll be exam-ready.</p>
          </button>
        </div>
      )}

      {step !== 'choose' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="space-y-5">
          <button type="button" onClick={() => setStep('choose')} className="text-sm text-brand-ink hover:underline">
            ← Choose a different way to plan
          </button>

          {step === 'examDate' && (
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-faint">Target Exam Date</label>
              <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} className="input-dark" />
            </div>
          )}

          {step === 'pace' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPaceInputKind('questions')}
                  className={`flex-1 rounded-lg border py-2 text-sm ${paceInputKind === 'questions' ? 'border-[#1D4ED8] bg-[#1D4ED8]/10 text-[#1D4ED8]' : 'border-surface-border text-ink-muted'}`}
                >
                  Questions Per Day
                </button>
                <button
                  type="button"
                  onClick={() => setPaceInputKind('minutes')}
                  className={`flex-1 rounded-lg border py-2 text-sm ${paceInputKind === 'minutes' ? 'border-[#1D4ED8] bg-[#1D4ED8]/10 text-[#1D4ED8]' : 'border-surface-border text-ink-muted'}`}
                >
                  Time Per Day
                </button>
              </div>

              {paceInputKind === 'questions' ? (
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-faint">
                    How many questions can you comfortably practice each day?
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {QUESTIONS_PER_DAY_PRESETS.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => {
                          setQuestionsPerDay(q);
                          setCustomQuestions('');
                        }}
                        className={`rounded-full border px-3 py-1 text-xs ${
                          !customQuestions && questionsPerDay === q ? 'border-[#1D4ED8] bg-[#1D4ED8]/10 text-[#1D4ED8]' : 'border-surface-border text-ink-muted'
                        }`}
                      >
                        {q} Questions
                      </button>
                    ))}
                    <input
                      type="number"
                      min={1}
                      value={customQuestions}
                      onChange={(e) => setCustomQuestions(e.target.value)}
                      placeholder="Custom"
                      className="input-dark w-24"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-faint">
                    How much time can you comfortably study each day?
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {MINUTES_PER_DAY_PRESETS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          setMinutesPerDay(m);
                          setCustomMinutes('');
                        }}
                        className={`rounded-full border px-3 py-1 text-xs ${
                          !customMinutes && minutesPerDay === m ? 'border-[#1D4ED8] bg-[#1D4ED8]/10 text-[#1D4ED8]' : 'border-surface-border text-ink-muted'
                        }`}
                      >
                        {m < 60 ? `${m} Min` : `${m / 60} Hr${m > 60 ? 's' : ''}`}
                      </button>
                    ))}
                    <input
                      type="number"
                      min={1}
                      value={customMinutes}
                      onChange={(e) => setCustomMinutes(e.target.value)}
                      placeholder="Custom min"
                      className="input-dark w-28"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-faint">Which days do you normally study?</label>
            <div className="flex flex-wrap gap-1.5">
              {STUDY_DAY_LABELS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleDay(key)}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    studyDays[key] ? 'border-[#1D4ED8] bg-[#1D4ED8]/10 text-[#1D4ED8]' : 'border-surface-border text-ink-muted'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right column — the live result, kept visible alongside the form
            instead of below the fold, so every input change's effect is
            seen immediately without scrolling. */}
        <div className="space-y-5 lg:sticky lg:top-20">
          {step === 'examDate' && examDatePreview && (
            <>
              {feasibility && !feasibility.feasible && (
                <div className="rounded-xl border border-[#d87f1d]/40 bg-[#d87f1d]/10 p-4 text-sm text-ink">
                  Your current plan may require more study time to complete the question bank before your planned revision period. To
                  stay on this exam date, approximately <strong>{feasibility.requiredQuestionsPerDay} questions/day</strong> (about{' '}
                  <strong>{Math.round(feasibility.requiredMinutesPerDay / 60)} hour(s)/day</strong>) would be required. Consider
                  increasing your daily study time, adding more study days, or adjusting your exam date.
                </div>
              )}
              <div className="overflow-hidden rounded-2xl border border-[#1D4ED8]/30 bg-surface-raised">
                <div className="bg-gradient-to-r from-[#1D4ED8] to-[#0f2f8f] px-5 py-3">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-white">Your {test.title} Plan</h2>
                </div>
                <dl className="grid grid-cols-2 gap-4 p-5 text-sm">
                  <PlanStat label="🎯 Exam" value={formatDisplayDate(new Date(examDate))} />
                  <PlanStat label="📅 Days to Exam" value={`${examDatePreview.daysToExam} Days`} accent="amber" />
                  <PlanStat label="📚 Practice Deadline" value={formatDisplayDate(examDatePreview.practiceDeadline)} />
                  <PlanStat
                    label="🔄 Final Revision"
                    value={`${formatDisplayDate(examDatePreview.revisionStart)} → ${formatDisplayDate(new Date(examDate))}`}
                  />
                  <PlanStat label="📖 Questions Remaining" value={String(examDatePreview.remainingQuestions)} />
                  <PlanStat label="🎯 Daily Target" value={`${examDatePreview.dailyTarget} Questions`} accent="blue" />
                  <PlanStat label="⏱ Estimated Study Time" value={`~${examDatePreview.estMinutesPerDay} min/day`} />
                </dl>
              </div>
            </>
          )}

          {step === 'pace' && pacePreview && (
            <div className="overflow-hidden rounded-2xl border border-[#d87f1d]/30 bg-surface-raised">
              <div className="bg-gradient-to-r from-[#d87f1d] to-[#a85f10] px-5 py-3">
                <h2 className="text-sm font-bold uppercase tracking-wide text-white">Your {test.title} Plan</h2>
              </div>
              <div className="p-5">
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <PlanStat label="📚 Question Bank" value={`${totalQuestions} Questions`} />
                  <PlanStat label="🎯 Daily Target" value={`${resolvedQuestionsPerDay} Questions`} accent="blue" />
                  <PlanStat label="📅 Practice Duration" value={`${pacePreview.studyDaysNeeded} Study Days`} />
                  <PlanStat label="🔄 Final Revision" value={`${revisionBufferDays} Days`} />
                  <PlanStat label="📆 Practice Completion" value={formatDisplayDate(pacePreview.practiceCompletionDate)} />
                  <PlanStat label="🏁 Suggested Exam Date" value={formatDisplayDate(pacePreview.suggestedExamDate)} accent="amber" />
                  <PlanStat label="⏱ Estimated Daily Study" value={`~${pacePreview.estMinutesPerDay} min/day`} />
                </dl>
                <p className="mt-4 text-sm text-ink">
                  Maintain {resolvedQuestionsPerDay} questions per study day and you'll complete your first pass in approximately{' '}
                  {pacePreview.studyDaysNeeded} study days.
                </p>
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={
              saveMutation.isPending || (step === 'examDate' ? !examDate : resolvedQuestionsPerDay <= 0)
            }
            onClick={() => saveMutation.mutate(step === 'examDate' ? 'examDate' : 'pace')}
            className="w-full rounded-lg bg-[#1D4ED8] py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Saving…' : 'Save My Plan'}
          </button>
        </div>
        </div>
      )}
    </div>
  );
}

function PlanStat({ label, value, accent }: { label: string; value: string; accent?: 'blue' | 'amber' }) {
  const accentClass = accent === 'blue' ? 'text-[#1D4ED8]' : accent === 'amber' ? 'text-[#d87f1d]' : 'text-ink';
  return (
    <div>
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className={`font-semibold ${accentClass}`}>{value}</dd>
    </div>
  );
}
