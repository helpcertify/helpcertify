import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { listAvailableQuizzes, listPracticeTestsBucketed } from '../api/studentContentApi';
import { cartApi } from '../api/cartApi';
import { useCertificationCatalog, type CatalogCertification } from '../api/certificationCatalogApi';
import { activePurchaseKeys } from '../lib/purchaseAccess';
import { accuracyPct, mergePracticeProgress, type PracticeProgressLike } from '../lib/practiceStats';
import { rollUpStatus, type ExamStatus } from '../components/exam/examCta';

// One resolved practice set / mock exam within a certification's series.
export interface ExamSetDetail {
  itemId: string;
  index: number;
  totalQuestions: number;
  durationMinutes: number;
  owned: boolean;
  status: ExamStatus;
  // Practice
  answered: number;
  setAccuracyPct: number | null;
  // Mock
  scorePct: number | null;
}

// A certification's whole practice (or mock) series, plus every aggregate
// the browse card and the detail page need. Built entirely from the same
// reads the old pages used.
export interface ExamSeries {
  cert: CatalogCertification;
  seriesId: string;
  sets: ExamSetDetail[];
  totalQuestions: number;
  ownedTotalQuestions: number;
  owned: boolean;
  status: ExamStatus;
  // Practice progress rollups (across owned sets)
  progress: PracticeProgressLike;
  answeredUnique: number;
  practiceAccuracyPct: number | null;
  // Mock rollups
  mocksCompleted: number;
  bestScorePct: number | null;
  // Pricing (lowest "from" across the cert's packages)
  fromPrice: number | null;
  currency: 'INR' | 'USD';
  // Practice only - the series' own Study Planner defaults (from the first
  // batch; every batch in a generated series shares these), used to drive
  // StudyGoalPanel's series-scoped exam-date / pace planning.
  revisionBufferDays: number;
  defaultMinutesPerQuestion: number;
}

interface RawPracticeProgress extends PracticeProgressLike {
  testId: string;
}

function usePracticeProgress(uid: string | undefined) {
  return useQuery({
    // Distinct key: other callers of ['student','practiceProgress',uid] /
    // ['student','practiceProgressFull',uid] (usePrimaryGoal,
    // ProfileActivitySections) return a trimmed {testId, answeredQuestionIds}
    // shape. Sharing a key would let this hook read those objects and blow
    // up on the missing questionStats / incorrectQuestionIds.
    queryKey: ['student', 'practiceProgressStats', uid],
    enabled: !!uid,
    queryFn: async (): Promise<RawPracticeProgress[]> => {
      const snap = await getDocs(query(collection(db, 'practiceProgress'), where('userId', '==', uid)));
      return snap.docs.map((d) => {
        const data = d.data();
        return {
          testId: data.testId as string,
          answeredQuestionIds: (data.answeredQuestionIds as string[]) ?? [],
          incorrectQuestionIds: (data.incorrectQuestionIds as string[]) ?? [],
          questionStats: (data.questionStats as PracticeProgressLike['questionStats']) ?? {},
        };
      });
    },
  });
}

function useInProgressPracticeSessions(uid: string | undefined) {
  return useQuery({
    queryKey: ['student', 'practiceSessionsInProgress', uid],
    enabled: !!uid,
    queryFn: async (): Promise<string[]> => {
      const snap = await getDocs(query(collection(db, 'practiceSessions'), where('userId', '==', uid)));
      return snap.docs
        .map((d) => d.data())
        .filter((x) => x.status === 'in_progress')
        .map((x) => x.testId as string);
    },
  });
}

export interface MockAttemptRecord {
  attemptId: string;
  quizId: string;
  status: string;
  correctCount: number;
  totalQuestions: number;
  scorePct: number | null;
  submittedAtMs: number | null;
  durationSeconds: number | null;
}

interface QuizAttemptAgg {
  bestScorePct: number | null;
  hasSubmitted: boolean;
  hasInProgress: boolean;
}

// Every mock (quiz) attempt the learner has made. Shared by the browse
// aggregation and the per-certification mock detail page (Performance /
// Review History tabs) so the read happens once.
export function useMyMockAttempts() {
  const uid = useAuthStore((s) => s.firebaseUser?.uid);
  return useQuery({
    queryKey: ['student', 'myMockAttempts', uid],
    enabled: !!uid,
    queryFn: async (): Promise<MockAttemptRecord[]> => {
      const snap = await getDocs(query(collection(db, 'quizAttempts'), where('userId', '==', uid)));
      return snap.docs.map((d) => {
        const x = d.data();
        const total = (x.totalQuestions as number) ?? 0;
        const correct = (x.correctCount as number) ?? 0;
        const submitted = x.submittedAt as { toMillis?: () => number } | undefined;
        return {
          attemptId: d.id,
          quizId: x.quizId as string,
          status: x.status as string,
          correctCount: correct,
          totalQuestions: total,
          scorePct: x.status !== 'in_progress' && total > 0 ? Math.round((correct / total) * 100) : null,
          submittedAtMs: submitted?.toMillis?.() ?? null,
          durationSeconds: (x.durationSeconds as number | undefined) ?? null,
        };
      });
    },
  });
}

export function aggregateMockAttempts(attempts: MockAttemptRecord[]): Record<string, QuizAttemptAgg> {
  const byQuiz: Record<string, QuizAttemptAgg> = {};
  for (const a of attempts) {
    const cur = byQuiz[a.quizId] ?? { bestScorePct: null, hasSubmitted: false, hasInProgress: false };
    if (a.status === 'in_progress') {
      cur.hasInProgress = true;
    } else {
      cur.hasSubmitted = true;
      if (a.scorePct != null) cur.bestScorePct = cur.bestScorePct == null ? a.scorePct : Math.max(cur.bestScorePct, a.scorePct);
    }
    byQuiz[a.quizId] = cur;
  }
  return byQuiz;
}

const EMPTY_PROGRESS: PracticeProgressLike = {
  answeredQuestionIds: [],
  incorrectQuestionIds: [],
  questionStats: {},
};

function lowestPrice(cert: CatalogCertification): number | null {
  let from: number | null = null;
  for (const p of cert.packages) {
    if (p.price > 0 && (from === null || p.price < from)) from = p.price;
  }
  return from;
}

// Resolve the seriesId a certification's packages point at, for the given
// pool of batches, then return that series' batches sorted by index.
function resolveSeries<T extends { id: string; seriesId?: string; batchIndex?: number }>(
  includedIds: Set<string>,
  batches: T[],
): { seriesId: string; sorted: T[] } | null {
  let seriesId: string | undefined;
  for (const b of batches) {
    if (includedIds.has(b.id)) {
      seriesId = b.seriesId;
      break;
    }
  }
  if (!seriesId) return null;
  const sorted = batches.filter((b) => b.seriesId === seriesId).sort((a, b) => (a.batchIndex ?? 0) - (b.batchIndex ?? 0));
  return sorted.length ? { seriesId, sorted } : null;
}

// Every practice-question-bank certification series the learner can see,
// with per-set state and cert-level rollups.
export function usePracticeSeries() {
  const uid = useAuthStore((s) => s.firebaseUser?.uid);
  const catalogQ = useCertificationCatalog();
  const batchesQ = useQuery({ queryKey: ['student', 'practiceTests'], queryFn: listPracticeTestsBucketed });
  const purchasesQ = useQuery({ queryKey: ['student', 'purchases'], queryFn: cartApi.listMyPurchases });
  const progressQ = usePracticeProgress(uid);
  const sessionsQ = useInProgressPracticeSessions(uid);

  const series = useMemo<ExamSeries[]>(() => {
    const certs = catalogQ.data?.certifications ?? [];
    const batches = (batchesQ.data?.available ?? []).filter((t) => !!t.seriesId);
    const purchasedSet = activePurchaseKeys(purchasesQ.data?.purchases);
    const progressByTest = new Map((progressQ.data ?? []).map((p) => [p.testId, p]));
    const inProgress = new Set(sessionsQ.data ?? []);

    const out: ExamSeries[] = [];
    for (const cert of certs) {
      const included = new Set(cert.packages.flatMap((p) => p.includedPracticeTestIds));
      const resolved = resolveSeries(included, batches);
      if (!resolved) continue;

      const sets: ExamSetDetail[] = resolved.sorted.map((b) => {
        const owned = purchasedSet.has(`practiceTest_${b.id}`);
        const prog = progressByTest.get(b.id);
        const answered = prog?.answeredQuestionIds.length ?? 0;
        const done = (b.totalQuestions ?? 0) > 0 && answered >= (b.totalQuestions ?? 0);
        const status: ExamStatus = !owned
          ? 'locked'
          : done
            ? 'completed'
            : answered > 0 || inProgress.has(b.id)
              ? 'in_progress'
              : 'not_started';
        return {
          itemId: b.id,
          index: b.batchIndex ?? 0,
          totalQuestions: b.totalQuestions ?? 0,
          durationMinutes: 0,
          owned,
          status,
          answered,
          setAccuracyPct: accuracyPct(prog),
          scorePct: null,
        };
      });

      const merged = mergePracticeProgress(sets.filter((s) => s.owned).map((s) => progressByTest.get(s.itemId)));

      out.push({
        cert,
        seriesId: resolved.seriesId,
        sets,
        totalQuestions: resolved.sorted.reduce((sum, b) => sum + (b.totalQuestions ?? 0), 0),
        ownedTotalQuestions: sets.filter((s) => s.owned).reduce((sum, s) => sum + s.totalQuestions, 0),
        owned: sets.some((s) => s.owned),
        status: rollUpStatus(sets),
        progress: merged,
        answeredUnique: merged.answeredQuestionIds.length,
        practiceAccuracyPct: accuracyPct(merged),
        mocksCompleted: 0,
        bestScorePct: null,
        fromPrice: lowestPrice(cert),
        currency: cert.packages[0]?.currency ?? 'INR',
        revisionBufferDays: resolved.sorted[0]?.revisionBufferDays ?? 3,
        defaultMinutesPerQuestion: resolved.sorted[0]?.defaultMinutesPerQuestion ?? 1.8,
      });
    }
    return out.sort((a, b) => a.cert.name.localeCompare(b.cert.name));
  }, [catalogQ.data, batchesQ.data, purchasesQ.data, progressQ.data, sessionsQ.data]);

  return {
    series,
    isLoading: catalogQ.isLoading || batchesQ.isLoading,
    isError: catalogQ.isError || batchesQ.isError,
    refetch: () => {
      void catalogQ.refetch();
      void batchesQ.refetch();
    },
  };
}

// Every mock-exam certification series the learner can see.
export function useMockSeries() {
  const catalogQ = useCertificationCatalog();
  const quizzesQ = useQuery({ queryKey: ['student', 'availableQuizzes'], queryFn: listAvailableQuizzes });
  const purchasesQ = useQuery({ queryKey: ['student', 'purchases'], queryFn: cartApi.listMyPurchases });
  const attemptsQ = useMyMockAttempts();

  const series = useMemo<ExamSeries[]>(() => {
    const certs = catalogQ.data?.certifications ?? [];
    const batches = (quizzesQ.data ?? []).filter((q) => !!q.seriesId);
    const purchasedSet = activePurchaseKeys(purchasesQ.data?.purchases);
    const attemptByQuiz = aggregateMockAttempts(attemptsQ.data ?? []);

    const out: ExamSeries[] = [];
    for (const cert of certs) {
      const included = new Set(cert.packages.flatMap((p) => p.includedQuizIds));
      const resolved = resolveSeries(included, batches);
      if (!resolved) continue;

      const sets: ExamSetDetail[] = resolved.sorted.map((q) => {
        const owned = purchasedSet.has(`quiz_${q.id}`);
        const agg = attemptByQuiz[q.id];
        const status: ExamStatus = !owned
          ? 'locked'
          : agg?.hasSubmitted
            ? 'completed'
            : agg?.hasInProgress
              ? 'in_progress'
              : 'not_started';
        return {
          itemId: q.id,
          index: q.batchIndex ?? 0,
          totalQuestions: q.totalQuestions ?? 0,
          durationMinutes: q.durationMinutes ?? 0,
          owned,
          status,
          answered: 0,
          setAccuracyPct: null,
          scorePct: agg?.bestScorePct ?? null,
        };
      });

      const scores = sets
        .filter((s) => s.status === 'completed')
        .map((s) => s.scorePct)
        .filter((v): v is number => v != null);

      out.push({
        cert,
        seriesId: resolved.seriesId,
        sets,
        totalQuestions: resolved.sorted.reduce((sum, q) => sum + (q.totalQuestions ?? 0), 0),
        ownedTotalQuestions: sets.filter((s) => s.owned).reduce((sum, s) => sum + s.totalQuestions, 0),
        owned: sets.some((s) => s.owned),
        status: rollUpStatus(sets),
        progress: EMPTY_PROGRESS,
        answeredUnique: 0,
        practiceAccuracyPct: null,
        mocksCompleted: sets.filter((s) => s.status === 'completed').length,
        bestScorePct: scores.length ? Math.max(...scores) : null,
        fromPrice: lowestPrice(cert),
        currency: cert.packages[0]?.currency ?? 'INR',
        // Not applicable to mock series - the Study Planner is a practice-
        // bank feature only.
        revisionBufferDays: 0,
        defaultMinutesPerQuestion: 0,
      });
    }
    return out.sort((a, b) => a.cert.name.localeCompare(b.cert.name));
  }, [catalogQ.data, quizzesQ.data, purchasesQ.data, attemptsQ.data]);

  return {
    series,
    isLoading: catalogQ.isLoading || quizzesQ.isLoading,
    isError: catalogQ.isError || quizzesQ.isError,
    refetch: () => {
      void catalogQ.refetch();
      void quizzesQ.refetch();
    },
  };
}
