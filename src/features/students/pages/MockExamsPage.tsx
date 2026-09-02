import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { listAvailableQuizzes } from '../api/studentContentApi';
import { cartApi } from '../api/cartApi';
import { useCertificationCatalog } from '../api/certificationCatalogApi';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { activePurchaseKeys } from '../lib/purchaseAccess';
import { ExamSeriesGroup } from '../components/ExamSeriesGroup';
import type { QuizDoc } from '@/types/models';

type Batch = QuizDoc & { id: string };

const pad = (n: number) => String(n).padStart(2, '0');

// Full-length, timed exam simulations. Grouped into one card per
// certification (mirrors the Practice Exams page); each link opens the take
// page directly. Standalone (non-series) quizzes are hidden here.
export function MockExamsPage() {
  const uid = useAuthStore((s) => s.firebaseUser?.uid);

  const { data: quizzes } = useQuery({ queryKey: ['student', 'availableQuizzes'], queryFn: listAvailableQuizzes });
  const { data: catalog } = useCertificationCatalog();
  const { data: purchases } = useQuery({ queryKey: ['student', 'purchases'], queryFn: cartApi.listMyPurchases });
  const { data: myAttempts } = useQuery({
    queryKey: ['student', 'myQuizAttempts', uid],
    queryFn: async () => {
      const snap = await getDocs(query(collection(db, 'quizAttempts'), where('userId', '==', uid)));
      return snap.docs.map((d) => {
        const data = d.data();
        return { quizId: data.quizId as string, status: data.status as string };
      });
    },
    enabled: !!uid,
  });

  const attemptByQuizId = new Map((myAttempts ?? []).map((a) => [a.quizId, a]));
  const purchasedSet = activePurchaseKeys(purchases?.purchases);

  const certNameByQuizId = new Map<string, string>();
  for (const cert of catalog?.certifications ?? []) {
    for (const pkg of cert.packages) {
      for (const id of pkg.includedQuizIds) certNameByQuizId.set(id, cert.name);
    }
  }

  const seriesBatches = (quizzes ?? []).filter((q): q is Batch => !!q.seriesId);
  const bySeriesId = new Map<string, Batch[]>();
  for (const q of seriesBatches) {
    const list = bySeriesId.get(q.seriesId!) ?? [];
    list.push(q);
    bySeriesId.set(q.seriesId!, list);
  }

  const seriesList = [...bySeriesId.entries()]
    .map(([seriesId, batches]) => {
      const sorted = [...batches].sort((a, b) => (a.batchIndex ?? 0) - (b.batchIndex ?? 0));
      return {
        seriesId,
        certName: certNameByQuizId.get(sorted[0].id) ?? sorted[0].title,
        batches: sorted,
        totalQuestions: sorted.reduce((sum, b) => sum + (b.totalQuestions ?? 0), 0),
        owned: sorted.every((b) => purchasedSet.has(`quiz_${b.id}`)),
      };
    })
    .sort((a, b) => a.certName.localeCompare(b.certName));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-ink">Mock Exams</h1>
      <p className="mb-6 text-sm text-ink-faint">
        Full-length, timed exam simulations. Questions and options are shuffled on every attempt.
      </p>

      {seriesList.length === 0 ? (
        <p className="rounded-xl border border-dashed border-surface-border p-6 text-center text-sm text-ink-faint">
          No mock exams are available yet.
        </p>
      ) : (
        seriesList.map((s) => (
          <ExamSeriesGroup
            key={s.seriesId}
            certName={s.certName}
            kind="mock"
            totalQuestions={s.totalQuestions}
            owned={s.owned}
            entitlementLocked={!s.owned}
            items={s.batches.map((b) => {
              const attempt = attemptByQuizId.get(b.id);
              return {
                id: b.id,
                batchIndex: b.batchIndex ?? 0,
                label: `${s.certName} Mock Exam ${pad(b.batchIndex ?? 0)}`,
                hint:
                  attempt?.status === 'in_progress'
                    ? 'Resume'
                    : attempt
                      ? 'Attempted'
                      : `${b.totalQuestions} questions`,
              };
            })}
          />
        ))
      )}
    </div>
  );
}
