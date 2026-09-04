import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../api/adminApi';
import { toDate } from '@/utils/formatDate';
import { useUiStore } from '@/store/useUiStore';
import { errorText } from '@/lib/errorMessages';

function formatDate(ts: unknown): string {
  return toDate(ts).toLocaleDateString();
}

// The admin-facing "who's registered, who's verified, who's actually
// bought something" view - a plain list plus a per-user detail panel with
// their paid orders. There's no mobile-number field collected anywhere in
// the app yet (that would arrive alongside Mobile OTP, once an SMS
// provider is connected - see AdminSettingsPage), so that column reads
// "Not collected" for every row rather than silently omitting it.
export function AdminUsersPage() {
  const { data } = useQuery({ queryKey: ['admin', 'users'], queryFn: adminApi.listUsersAdmin });
  const users = data?.users ?? [];
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const pushToast = useUiStore((s) => s.pushToast);
  const queryClient = useQueryClient();

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['admin', 'userDetail', selectedUid],
    queryFn: () => adminApi.getUserDetailAdmin(selectedUid!),
    enabled: !!selectedUid,
  });

  const grantTrainerMutation = useMutation({
    mutationFn: () => adminApi.grantTrainerStatus(selectedUid!),
    onSuccess: () => {
      pushToast('Trainer status granted.', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'userDetail', selectedUid] });
    },
    onError: (err) => pushToast(errorText(err, 'Could not grant trainer status'), 'error'),
  });

  const revokeTrainerMutation = useMutation({
    mutationFn: () => adminApi.revokeTrainerStatus(selectedUid!),
    onSuccess: () => {
      pushToast('Trainer status revoked.', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'userDetail', selectedUid] });
    },
    onError: (err) => pushToast(errorText(err, 'Could not revoke trainer status'), 'error'),
  });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-ink">Users</h1>
      <p className="mb-6 text-sm text-ink-faint">Everyone registered, their verification status, and what they've purchased.</p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="overflow-x-auto rounded-xl border border-surface-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/20 text-xs uppercase tracking-wide text-ink-faint">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Mobile</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Verified</th>
                <th className="px-4 py-3">Purchases</th>
                <th className="px-4 py-3">Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-ink-faint">
                    No users yet.
                  </td>
                </tr>
              )}
              {users.map((u) => (
                <tr
                  key={u.id}
                  onClick={() => setSelectedUid(u.id)}
                  className={`cursor-pointer border-t border-surface-border hover:bg-black/10 ${
                    selectedUid === u.id ? 'bg-brand-500/10' : ''
                  }`}
                >
                  <td className="px-4 py-3 text-ink">{u.name}</td>
                  <td className="px-4 py-3 text-ink-muted">{u.email}</td>
                  <td className="px-4 py-3 text-ink-faint">Not collected</td>
                  <td className="px-4 py-3 capitalize text-ink-muted">{u.role}</td>
                  <td className="px-4 py-3">
                    {u.emailVerified ? (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-600 dark:text-emerald-400">
                        Verified
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400">
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">{u.purchaseCount}</td>
                  <td className="px-4 py-3 text-ink-faint">{formatDate(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-surface-border bg-surface-raised p-5">
          {!selectedUid ? (
            <p className="text-sm text-ink-faint">Select a user to see their purchase history.</p>
          ) : detailLoading ? (
            <p className="text-sm text-ink-faint">Loading…</p>
          ) : detail ? (
            <div>
              <h2 className="mb-1 font-bold text-ink">{detail.user.name}</h2>
              <p className="mb-4 text-sm text-ink-faint">{detail.user.email}</p>

              <div className="mb-4 flex items-center justify-between rounded-lg border border-surface-border p-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-ink-faint">Trainer access</p>
                  <p className="text-sm text-ink-muted">{detail.user.trainerId ? 'Enabled' : 'Not a trainer'}</p>
                </div>
                {detail.user.trainerId ? (
                  <button
                    type="button"
                    onClick={() => revokeTrainerMutation.mutate()}
                    disabled={revokeTrainerMutation.isPending}
                    className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 disabled:opacity-60 dark:border-red-500/40 dark:hover:bg-red-500/10"
                  >
                    Revoke
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => grantTrainerMutation.mutate()}
                    disabled={grantTrainerMutation.isPending}
                    className="rounded-lg bg-[#155EEF] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                  >
                    Grant trainer access
                  </button>
                )}
              </div>

              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-faint">Purchases</h3>
              {detail.orders.length === 0 ? (
                <p className="text-sm text-ink-faint">No paid orders yet.</p>
              ) : (
                <ul className="space-y-3">
                  {detail.orders.map((order) => (
                    <li key={order.id} className="rounded-lg border border-surface-border p-3">
                      {order.items.map((item) => (
                        <div key={item.itemId} className="text-sm text-ink">
                          {item.title}
                        </div>
                      ))}
                      <div className="mt-1 flex items-center justify-between text-xs text-ink-faint">
                        <span>{formatDate(order.createdAt)}</span>
                        <span>
                          {order.currency} {order.total}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
