import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toDate } from '@/utils/formatDate';
import { listPracticeTestsBucketed } from '../api/studentContentApi';
import { cartApi } from '../api/cartApi';
import { useCertificationCatalog } from '../api/certificationCatalogApi';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { PrimaryGoalStatRow } from '../components/PrimaryGoalStatRow';
import { ExamSeriesGroup } from '../components/ExamSeriesGroup';
import { StudyGoalPanel } from '../components/StudyGoalPanel';
import { activePurchaseKeys } from '../lib/purchaseAccess';
import type { PracticeTestDoc } from '@/types/models';

type Batch = PracticeTestDoc & { id: string };

interface SeriesBucket {
  seriesId: string;
  certName: string;
  batches: Batch[];
  totalQuestions: number;
  owned: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function PracticeTestsPage() {
  const uid = useAuthStore((s) => s.firebaseUser?.uid);
  const [goalOpenFor, setGoalOpenFor] = useState<string | null>(null);

  const { data: buckets } = useQuery({ queryKey: ['student', 'practiceTests'], queryFn: listPracticeTestsBucketed });
  const { data: catalog } = useCertificationCatalog();
  const { data: purchases } = useQuery({ queryKey: ['student', 'purchases'], queryFn: cartApi.listMyPurchases });
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

  // The most recent still-open practice session, for "Continue where you
  // left off". userId-only query (guaranteed single-field index) then filter
  // client-side - a learner has at most a handful of sessions.
  const { data: openSession } = useQuery({
    queryKey: ['student', 'openPracticeSession', uid],
    queryFn: async () => {
      const snap = await getDocs(query(collection(db, 'practiceSessions'), where('userId', '==', uid)));
      const open = snap.docs
        .map((d) => {
          const x = d.data();
          return {
            testId: x.testId as string,
            status: x.status as string,
            answeredCount: (x.answeredCount as number) ?? 0,
            batchSize: ((x.batchQuestionIds as string[]) ?? []).length,
            startedAt: toDate(x.startedAt),
          };
        })
        .filter((s) => s.status === 'in_progress')
        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
      return open[0] ?? null;
    },
    enabled: !!uid,
  });

  const answeredByTestId = new Map(
    (progressDocs ?? []).map((p) => [p.testId, p.answeredQuestionIds.length]),
  );
  const purchasedSet = activePurchaseKeys(purchases?.purchases);

  // practiceTest id -> full certification name, from the catalog's packages.
  const certNameByTestId = new Map<string, string>();
  for (const cert of catalog?.certifications ?? []) {
    for (const pkg of cert.packages) {
      for (const id of pkg.includedPracticeTestIds) certNameByTestId.set(id, cert.name);
    }
  }

  // Only batched-series content; standalone uploads are hidden here.
  const seriesBatches = (buckets?.available ?? []).filter((t): t is Batch => !!t.seriesId);
  const bySeriesId = new Map<string, Batch[]>();
  for (const b of seriesBatches) {
    const list = bySeriesId.get(b.seriesId!) ?? [];
    list.push(b);
    bySeriesId.set(b.seriesId!, list);
  }

  const seriesList: SeriesBucket[] = [...bySeriesId.entries()]
    .map(([seriesId, batches]) => {
      const sorted = [...batches].sort((a, b) => (a.batchIndex ?? 0) - (b.batchIndex ?? 0));
      return {
        seriesId,
        certName: certNameByTestId.get(sorted[0].id) ?? sorted[0].examName ?? sorted[0].title,
        batches: sorted,
        totalQuestions: sorted.reduce((sum, b) => sum + (b.totalQuestions ?? 0), 0),
        owned: sorted.every((b) => purchasedSet.has(`practiceTest_${b.id}`)),
      };
    })
    .sort((a, b) => a.certName.localeCompare(b.certName));

  const resumeBatch = openSession ? seriesBatches.find((b) => b.id === openSession.testId) : undefined;
  const resumeLabel = resumeBatch
    ? `${certNameByTestId.get(resumeBatch.id) ?? resumeBatch.examName ?? resumeBatch.title} Practice Exam ${pad(
        resumeBatch.batchIndex ?? 0,
      )}`
    : null;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-ink">Practice Exams</h1>
      <p className="mb-6 text-sm text-ink-faint">Pick an exam to jump straight in. Each session pulls only unanswered questions.</p>

      {openSession && resumeLabel && (
        <Link
          to={`/practice-tests/${openSession.testId}/take`}
          className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-brand-500/30 bg-brand-50 px-5 py-4 hover:bg-brand-500/10 dark:bg-brand-500/10"
        >
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-brand-ink">Continue where you left off</div>
            <div className="mt-0.5 text-sm font-semibold text-ink">{resumeLabel}</div>
            <div className="text-xs text-ink-faint">
              {openSession.answeredCount} of {openSession.batchSize} questions answered
            </div>
          </div>
          <span className="shrink-0 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white">Resume →</span>
        </Link>
      )}

      <PrimaryGoalStatRow />

      {seriesList.length === 0 ? (
        <p className="rounded-xl border border-dashed border-surface-border p-6 text-center text-sm text-ink-faint">
          No practice exams are available yet.
        </p>
      ) : (
        seriesList.map((s) => {
          const first = s.batches[0];
          return (
            <ExamSeriesGroup
              key={s.seriesId}
              certName={s.certName}
              kind="practice"
              totalQuestions={s.totalQuestions}
              owned={s.owned}
              entitlementLocked={!s.owned}
              onSetGoal={() => setGoalOpenFor((cur) => (cur === s.seriesId ? null : s.seriesId))}
              goalPanel={
                goalOpenFor === s.seriesId ? (
                  <StudyGoalPanel
                    series={{
                      seriesId: s.seriesId,
                      batchIds: s.batches.map((b) => b.id),
                      totalQuestions: s.totalQuestions,
                      revisionBufferDays: first.revisionBufferDays ?? 3,
                      defaultMinutesPerQuestion: first.defaultMinutesPerQuestion ?? 1.8,
                    }}
                    onSaved={() => setGoalOpenFor(null)}
                  />
                ) : undefined
              }
              items={s.batches.map((b) => {
                const answered = answeredByTestId.get(b.id) ?? 0;
                return {
                  id: b.id,
                  batchIndex: b.batchIndex ?? 0,
                  label: `${s.certName} Practice Exam ${pad(b.batchIndex ?? 0)}`,
                  hint:
                    answered >= b.totalQuestions
                      ? '✓ Completed'
                      : answered > 0
                        ? `${answered} / ${b.totalQuestions} practiced`
                        : `${b.totalQuestions} questions`,
                };
              })}
            />
          );
        })
      )}
    </div>
  );
}
