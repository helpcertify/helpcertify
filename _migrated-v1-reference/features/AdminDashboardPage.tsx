import { useQuery } from '@tanstack/react-query';
import { callAction } from '@/lib/vercelApi';
import { Spinner } from '@/components/common/Spinner';
import { formatDate } from '@/utils/formatDate';

interface AdminLogEntry {
  id: string;
  action: string;
  targetType: string;
  description: string;
  performedBy: string;
  createdAt: unknown;
}

// Landing view for the admin area — recent audit-log activity. User
// management, batch operations, and the upload pipeline (registerUpload ->
// parseDocument -> validateUploadQuestions) get their own routes as this
// area grows; this page exists mainly to prove the admin-only route guard
// (see router.tsx) and a staff-only action (adminLogs denies all direct
// Firestore access — see firestore.rules).
export function AdminDashboardPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-logs'],
    queryFn: () => callAction<{ logs: AdminLogEntry[] }>('admin', 'listAdminLogs', { limit: 10 }),
  });

  if (isLoading) return <Spinner />;
  if (isError) return <p className="text-red-600">Couldn&apos;t load admin activity.</p>;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Admin</h1>
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">Recent activity</h2>
      <ul className="space-y-2">
        {data?.logs.map((log) => (
          <li key={log.id} className="rounded border border-neutral-200 p-3 text-sm dark:border-neutral-800">
            {log.action} on {log.targetType} — {log.description}
            <span className="ml-2 text-xs text-neutral-400">{formatDate(log.createdAt)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
