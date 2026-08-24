import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { Spinner } from '@/components/common/Spinner';
import { formatDate } from '@/utils/formatDate';

interface CertificateRow {
  id: string;
  certificateNumber: string;
  courseTitle: string;
  percentage: number;
  grade: string;
  issueDate: unknown;
}

async function fetchMyCertificates(uid: string): Promise<CertificateRow[]> {
  const snap = await getDocs(
    query(
      collection(db, 'certificates'),
      where('userId', '==', uid),
      where('status', '==', 'issued'),
      orderBy('issueDate', 'desc')
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CertificateRow);
}

export function CertificatesPage() {
  const uid = useAuthStore((s) => s.profile?._id);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['my-certificates', uid],
    queryFn: () => fetchMyCertificates(uid as string),
    enabled: Boolean(uid),
  });

  if (isLoading) return <Spinner />;
  if (isError) return <p className="text-red-600">Couldn&apos;t load your certificates.</p>;

  if (!data?.length) {
    return <p className="text-neutral-500">No certificates earned yet — pass a certification exam to earn one.</p>;
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">My certificates</h1>
      <ul className="grid gap-4 sm:grid-cols-2">
        {data.map((cert) => (
          <li key={cert.id} className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            <h2 className="font-medium">{cert.courseTitle}</h2>
            <p className="text-sm text-neutral-500">
              {cert.certificateNumber} · Grade {cert.grade} ({cert.percentage}%)
            </p>
            <p className="mt-1 text-xs text-neutral-400">Issued {formatDate(cert.issueDate)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
