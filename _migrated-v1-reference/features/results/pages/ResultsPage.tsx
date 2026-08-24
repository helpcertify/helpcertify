import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { Spinner } from '@/components/common/Spinner';
import { formatDate } from '@/utils/formatDate';

interface ResultRow {
  id: string;
  examTitle: string;
  percentage: number;
  grade: string;
  createdAt: unknown;
}

async function fetchMyResults(uid: string): Promise<ResultRow[]> {
  // examTitle is denormalized onto the Result doc at grading time (see
  // functions/src/exams/session.ts) — Firestore has no server-side join, so
  // this is one query instead of an N+1 fetch per row.
  const snap = await getDocs(
    query(collection(db, 'results'), where('userId', '==', uid), orderBy('createdAt', 'desc'))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ResultRow);
}

export function ResultsPage() {
  const uid = useAuthStore((s) => s.profile?._id);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['my-results', uid],
    queryFn: () => fetchMyResults(uid as string),
    enabled: Boolean(uid),
  });

  if (isLoading) return <Spinner />;
  if (isError) return <p className="text-red-600">Couldn&apos;t load your results.</p>;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">My results</h1>
      <table className="w-full text-left text-sm">
        <thead className="text-neutral-500">
          <tr>
            <th className="py-2">Exam</th>
            <th>Score</th>
            <th>Grade</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {data?.map((r) => (
            <tr key={r.id} className="border-t border-neutral-200 dark:border-neutral-800">
              <td className="py-2">{r.examTitle}</td>
              <td>{r.percentage}%</td>
              <td>{r.grade}</td>
              <td>{formatDate(r.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
