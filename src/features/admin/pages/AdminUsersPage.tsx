import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi, BUILTIN_CATEGORY_LABELS } from '../api/adminApi';
import { toDate } from '@/utils/formatDate';
import { useUiStore } from '@/store/useUiStore';
import { errorText } from '@/lib/errorMessages';

function formatDate(ts: unknown): string {
  return toDate(ts).toLocaleDateString();
}

function categoryLabel(key: string, customLabels: Map<string, string>): string {
  return (BUILTIN_CATEGORY_LABELS as Record<string, string>)[key] ?? customLabels.get(key) ?? key;
}

// The admin-facing "who's registered, who's verified, who's actually
// bought something, and which category they fall under" view. Trainer/
// Content Partner/Sales Partner badges are derived at read time from
// existing trainer/partner/creator-role data (api/admin.ts's
// listUsersAdmin) - "Users" is just the label for "none of those apply,"
// not a stored flag. Admin can also create custom categories here (they
// become gateable in Settings' Feature Access card) and review pending
// Trainer/custom-category requests - Partner and Creator role requests
// keep their own full-featured review pages, linked below rather than
// duplicated.
export function AdminUsersPage() {
  const { data } = useQuery({ queryKey: ['admin', 'users'], queryFn: adminApi.listUsersAdmin });
  const users = data?.users ?? [];
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'users' | string>('all');
  const [newCategoryLabel, setNewCategoryLabel] = useState('');
  const pushToast = useUiStore((s) => s.pushToast);
  const queryClient = useQueryClient();

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['admin', 'userDetail', selectedUid],
    queryFn: () => adminApi.getUserDetailAdmin(selectedUid!),
    enabled: !!selectedUid,
  });

  const { data: categoriesData } = useQuery({ queryKey: ['admin', 'userCategories'], queryFn: adminApi.listUserCategories });
  const customCategories = categoriesData?.categories ?? [];
  const customLabels = new Map(customCategories.map((c) => [c.key, c.label]));

  const { data: trainerAppsData } = useQuery({
    queryKey: ['admin', 'trainerApplications', 'PENDING'],
    queryFn: () => adminApi.listTrainerApplications('PENDING'),
  });
  const { data: categoryRequestsData } = useQuery({
    queryKey: ['admin', 'userCategoryRequests', 'PENDING'],
    queryFn: () => adminApi.listUserCategoryRequests('PENDING'),
  });

  const invalidateUsers = () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });

  const grantTrainerMutation = useMutation({
    mutationFn: () => adminApi.grantTrainerStatus(selectedUid!),
    onSuccess: () => {
      pushToast('Trainer status granted.', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'userDetail', selectedUid] });
      invalidateUsers();
    },
    onError: (err) => pushToast(errorText(err, 'Could not grant trainer status'), 'error'),
  });

  const revokeTrainerMutation = useMutation({
    mutationFn: () => adminApi.revokeTrainerStatus(selectedUid!),
    onSuccess: () => {
      pushToast('Trainer status revoked.', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'userDetail', selectedUid] });
      invalidateUsers();
    },
    onError: (err) => pushToast(errorText(err, 'Could not revoke trainer status'), 'error'),
  });

  const createCategoryMutation = useMutation({
    mutationFn: () => adminApi.createUserCategory(newCategoryLabel.trim()),
    onSuccess: () => {
      pushToast('Category created.', 'success');
      setNewCategoryLabel('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'userCategories'] });
    },
    onError: (err) => pushToast(errorText(err, 'Could not create that category'), 'error'),
  });

  const reviewTrainerAppMutation = useMutation({
    mutationFn: (v: { applicationId: string; decision: 'approve' | 'reject' }) => adminApi.reviewTrainerApplication(v),
    onSuccess: () => {
      pushToast('Reviewed.', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'trainerApplications', 'PENDING'] });
      invalidateUsers();
    },
    onError: (err) => pushToast(errorText(err, 'Could not record that decision'), 'error'),
  });

  const reviewCategoryRequestMutation = useMutation({
    mutationFn: (v: { membershipId: string; decision: 'approve' | 'reject' }) => adminApi.reviewUserCategoryRequest(v),
    onSuccess: () => {
      pushToast('Reviewed.', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'userCategoryRequests', 'PENDING'] });
      invalidateUsers();
    },
    onError: (err) => pushToast(errorText(err, 'Could not record that decision'), 'error'),
  });

  const filterOptions = [
    { key: 'all', label: 'All' },
    { key: 'users', label: 'Users' },
    { key: 'trainer', label: 'Trainer' },
    { key: 'creator', label: 'Content Partner' },
    { key: 'salesPartner', label: 'Sales Partner' },
    ...customCategories.map((c) => ({ key: c.key, label: c.label })),
  ];

  const filteredUsers = users.filter((u) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'users') return u.categories.length === 0;
    return u.categories.includes(activeFilter);
  });

  const pendingCount = (trainerAppsData?.applications.length ?? 0) + (categoryRequestsData?.requests.length ?? 0);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-ink">Users</h1>
      <p className="mb-6 text-sm text-ink-faint">
        Everyone registered, segmented by category, their verification status, and what they've purchased.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {filterOptions.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setActiveFilter(f.key)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
              activeFilter === f.key
                ? 'border-brand-500 bg-brand-500/15 text-brand-ink'
                : 'border-surface-border text-ink-muted hover:border-brand-400'
            }`}
          >
            {f.label}
          </button>
        ))}
        <div className="flex items-center gap-1.5">
          <input
            value={newCategoryLabel}
            onChange={(e) => setNewCategoryLabel(e.target.value)}
            placeholder="New category name"
            className="input-dark h-8 w-40 text-xs"
          />
          <button
            type="button"
            disabled={createCategoryMutation.isPending || newCategoryLabel.trim().length < 2}
            onClick={() => createCategoryMutation.mutate()}
            className="rounded-full border border-surface-border px-3 py-1.5 text-xs font-medium text-ink-muted hover:border-brand-400 disabled:opacity-50"
          >
            + New Category
          </button>
        </div>
      </div>

      {pendingCount > 0 && (
        <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
            Category Requests ({pendingCount})
          </h2>
          <div className="space-y-2">
            {(trainerAppsData?.applications ?? []).map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-surface-border bg-surface-raised p-3">
                <div className="text-sm">
                  <span className="font-medium text-ink">Trainer</span>
                  <span className="text-ink-faint"> · {a.uid}</span>
                  {a.message && <div className="text-xs text-ink-faint">"{a.message}"</div>}
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    disabled={reviewTrainerAppMutation.isPending}
                    onClick={() => reviewTrainerAppMutation.mutate({ applicationId: a.id, decision: 'approve' })}
                    className="rounded bg-[#0B7A48] px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={reviewTrainerAppMutation.isPending}
                    onClick={() => reviewTrainerAppMutation.mutate({ applicationId: a.id, decision: 'reject' })}
                    className="rounded border border-[#B32D1A] px-2 py-1 text-xs text-[#B32D1A] disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
            {(categoryRequestsData?.requests ?? []).map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-surface-border bg-surface-raised p-3">
                <div className="text-sm">
                  <span className="font-medium text-ink">{categoryLabel(r.categoryKey, customLabels)}</span>
                  <span className="text-ink-faint"> · {r.uid}</span>
                  {r.message && <div className="text-xs text-ink-faint">"{r.message}"</div>}
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    disabled={reviewCategoryRequestMutation.isPending}
                    onClick={() => reviewCategoryRequestMutation.mutate({ membershipId: r.id, decision: 'approve' })}
                    className="rounded bg-[#0B7A48] px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={reviewCategoryRequestMutation.isPending}
                    onClick={() => reviewCategoryRequestMutation.mutate({ membershipId: r.id, decision: 'reject' })}
                    className="rounded border border-[#B32D1A] px-2 py-1 text-xs text-[#B32D1A] disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-faint">
            Partner and Content Partner (Creator role) applications have their own review queues -{' '}
            <Link to="/admin/partners" className="underline">
              Partners
            </Link>{' '}
            ·{' '}
            <Link to="/admin/creators" className="underline">
              Creators
            </Link>
            .
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="overflow-x-auto rounded-xl border border-surface-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/20 text-xs uppercase tracking-wide text-ink-faint">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Verified</th>
                <th className="px-4 py-3">Purchases</th>
                <th className="px-4 py-3">Joined</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-ink-faint">
                    No users in this category.
                  </td>
                </tr>
              )}
              {filteredUsers.map((u) => (
                <tr
                  key={u.id}
                  onClick={() => setSelectedUid(u.id)}
                  className={`cursor-pointer border-t border-surface-border hover:bg-black/10 ${
                    selectedUid === u.id ? 'bg-brand-500/10' : ''
                  }`}
                >
                  <td className="px-4 py-3 text-ink">{u.name}</td>
                  <td className="px-4 py-3 text-ink-muted">{u.email}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {u.role === 'admin' && (
                        <span className="rounded-full bg-black/20 px-2 py-0.5 text-xs text-ink-muted">Admin</span>
                      )}
                      {u.categories.length === 0 && u.role !== 'admin' ? (
                        <span className="rounded-full bg-black/20 px-2 py-0.5 text-xs text-ink-faint">Users</span>
                      ) : (
                        u.categories.map((c) => (
                          <span key={c} className="rounded-full bg-brand-500/15 px-2 py-0.5 text-xs text-brand-ink">
                            {categoryLabel(c, customLabels)}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
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
