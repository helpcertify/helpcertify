import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { listPracticeTestsBucketed } from '../api/studentContentApi';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { toDate } from '@/utils/formatDate';

// availableFrom/Until arrive over JSON as a serialized Firestore Timestamp
// ({ _seconds, _nanoseconds }, not { seconds }) — toDate() handles that
// shape; a bare `ts.seconds * 1000` silently produced an Invalid Date here.
function formatDate(ts: unknown): string {
  return toDate(ts).toLocaleDateString();
}

export function PracticeTestsPage() {
  const uid = useAuthStore((s) => s.firebaseUser?.uid);

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

  const progressByTestId = new Map((progressDocs ?? []).map((p) => [p.testId, p]));
  const available = buckets?.available ?? [];
  const startedCount = available.filter((t) => (progressByTestId.get(t.id)?.answeredQuestionIds.length ?? 0) > 0).length;
  const completedCount = available.filter(
    (t) => (progressByTestId.get(t.id)?.answeredQuestionIds.length ?? 0) >= t.totalQuestions
  ).length;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-white">Practice Tests</h1>
      <p className="mb-6 text-sm text-neutral-500">Resume where you left off. Each session pulls only unanswered questions.</p>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Available" value={available.length} color="text-brand-400" />
        <StatCard label="Started" value={startedCount} color="text-amber-400" />
        <StatCard label="Completed" value={completedCount} color="text-emerald-400" />
      </div>

      {available.length === 0 ? (
        <p className="rounded-xl border border-dashed border-surface-border p-6 text-center text-sm text-neutral-500">
          No practice tests are available right now.
        </p>
      ) : (
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {available.map((test) => {
            const answered = progressByTestId.get(test.id)?.answeredQuestionIds.length ?? 0;
            const done = answered >= test.totalQuestions;
            return (
              <div key={test.id} className="rounded-xl border border-surface-border bg-surface-raised p-5">
                <h3 className="mb-1 font-semibold text-white">{test.title}</h3>
                <div className="mb-4 space-y-0.5 text-sm text-neutral-500">
                  <div>{answered} / {test.totalQuestions} answered</div>
                  <div>{test.durationPerSessionMinutes} min/session</div>
                </div>
                <div className="flex gap-2">
                  {!done && (
                    <Link
                      to={`/practice-tests/${test.id}/take`}
                      className="flex-1 rounded-lg bg-brand-gradient py-2 text-center text-sm font-medium text-surface"
                    >
                      {answered > 0 ? 'Resume' : 'Start'}
                    </Link>
                  )}
                  {answered > 0 && (
                    <Link
                      to={`/practice-tests/${test.id}/take?reattempt=1`}
                      className="flex-1 rounded-lg border border-surface-border py-2 text-center text-sm text-neutral-300"
                    >
                      Reattempt
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {((buckets?.upcoming.length ?? 0) > 0 || (buckets?.expired.length ?? 0) > 0) && (
        <>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">Upcoming / Expired</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...(buckets?.upcoming ?? []), ...(buckets?.expired ?? [])].map((test) => (
              <div key={test.id} className="rounded-xl border border-surface-border bg-black/20 p-5 opacity-70">
                <div className="mb-2 flex items-start justify-between">
                  <h3 className="font-semibold text-white">{test.title}</h3>
                  <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
                    🔒 {toDate(test.availableUntil).getTime() < Date.now() ? 'Expired' : 'Upcoming'}
                  </span>
                </div>
                <div className="text-sm text-neutral-500">
                  {test.totalQuestions} questions · {test.durationPerSessionMinutes} min/session
                  <br />
                  {formatDate(test.availableFrom)} → {formatDate(test.availableUntil)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-raised p-5">
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className={`mt-2 text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
