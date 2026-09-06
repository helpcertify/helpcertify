import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { contentAdminApi, type CertificationAdminRow, type PackageAdminRow } from '../api/contentAdminApi';
import { confirmDialog } from '@/store/useDialogStore';
import { useUiStore } from '@/store/useUiStore';
import { toDate } from '@/utils/formatDate';
import { formatMoney } from '@/utils/currency';
import { computeOfferStatus, type OfferStatus } from '../lib/offerStatus';
import { errorText } from '@/lib/errorMessages';

type StatusFilter = 'all' | CertificationAdminRow['status'];
type SortKey = 'displayOrder' | 'name' | 'updated';

const STATUS_BADGE: Record<CertificationAdminRow['status'], string> = {
  draft: 'bg-surface-sunken text-ink-faint',
  scheduled: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  published: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  unpublished: 'bg-surface-sunken text-ink-faint',
  archived: 'bg-red-500/15 text-red-500',
};

const OFFER_STATUS_BADGE: Record<OfferStatus, string> = {
  none: 'bg-surface-sunken text-ink-faint',
  scheduled: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  active: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  expired: 'bg-surface-sunken text-ink-faint',
  cancelled: 'bg-red-500/15 text-red-500',
};

function toDateOrNull(v: unknown): Date | null {
  if (!v) return null;
  return toDate(v);
}

// Products & Pricing landing page - one row per certification (never one
// row per package, per the spec's own worked CISM example), a Scheduled
// Offers tab, and the toolbar/summary counts an admin needs to find what
// they're looking for across a growing catalog. Edit/Preview/Duplicate/
// Archive live per row; the four-step create/edit workflow itself is
// CertificationEditorPage.tsx.
export function ProductsPricingPage() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const [tab, setTab] = useState<'certifications' | 'offers'>('certifications');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [providerFilter, setProviderFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('displayOrder');

  const { data: certData, isLoading: certLoading, error: certError, refetch: refetchCerts } = useQuery({
    queryKey: ['admin', 'certifications'],
    queryFn: contentAdminApi.listCertificationsAdmin,
  });
  const { data: pkgData, isLoading: pkgLoading, error: pkgError } = useQuery({
    queryKey: ['admin', 'packages'],
    queryFn: () => contentAdminApi.listPackagesAdmin(),
  });

  const certifications = useMemo(() => certData?.certifications ?? [], [certData]);
  const packages = useMemo(() => pkgData?.packages ?? [], [pkgData]);
  const packagesByCert = useMemo(() => {
    const map = new Map<string, PackageAdminRow[]>();
    for (const pkg of packages) {
      const list = map.get(pkg.certificationId) ?? [];
      list.push(pkg);
      map.set(pkg.certificationId, list);
    }
    return map;
  }, [packages]);

  const providers = useMemo(() => Array.from(new Set(certifications.map((c) => c.provider))).sort(), [certifications]);

  const filtered = useMemo(() => {
    let list = certifications;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q) || c.shortName.toLowerCase().includes(q) || c.provider.toLowerCase().includes(q));
    }
    if (statusFilter !== 'all') list = list.filter((c) => c.status === statusFilter);
    if (providerFilter !== 'all') list = list.filter((c) => c.provider === providerFilter);
    const sorted = [...list];
    if (sortKey === 'displayOrder') sorted.sort((a, b) => a.displayOrder - b.displayOrder);
    else if (sortKey === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    else sorted.sort((a, b) => toDate(b.updatedAt).getTime() - toDate(a.updatedAt).getTime());
    return sorted;
  }, [certifications, search, statusFilter, providerFilter, sortKey]);

  const publishedCount = certifications.filter((c) => c.status === 'published').length;
  const draftCount = certifications.filter((c) => c.status === 'draft').length;
  const activePackageCount = packages.filter((p) => p.status === 'published').length;
  const now = new Date();
  const activeOfferCount = packages.filter(
    (p) => computeOfferStatus({ offerPrice: p.offerPrice, offerStart: toDateOrNull(p.offerStart), offerEnd: toDateOrNull(p.offerEnd), offerCancelledAt: toDateOrNull(p.offerCancelledAt) }, now) === 'active'
  ).length;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'certifications'] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'packages'] });
  };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => contentAdminApi.deleteCertification(id),
    onSuccess: () => {
      pushToast('Exam preparation deleted', 'success');
      invalidate();
    },
    onError: (err) => pushToast(errorText(err, 'Could not delete exam preparation'), 'error'),
  });
  const cancelOfferMutation = useMutation({
    mutationFn: (packageId: string) => contentAdminApi.cancelOffer(packageId),
    onSuccess: () => {
      pushToast('Offer cancelled', 'success');
      invalidate();
    },
    onError: (err) => pushToast(errorText(err, 'Could not cancel the offer'), 'error'),
  });

  const isLoading = certLoading || pkgLoading;
  const hasError = certError || pkgError;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-ink">Products & Pricing</h1>
      <p className="mb-6 text-sm text-ink-faint">Create each exam preparation once, then configure its packages, pricing and exam rules.</p>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Published" value={publishedCount} />
        <StatCard label="Draft" value={draftCount} />
        <StatCard label="Active Packages" value={activePackageCount} />
        <StatCard label="Active Scheduled Offers" value={activeOfferCount} />
      </div>

      <div className="mb-5 flex gap-1 border-b border-surface-border">
        <button
          type="button"
          onClick={() => setTab('certifications')}
          className={`border-b-2 px-4 py-2 text-sm font-medium ${tab === 'certifications' ? 'border-brand-500 text-brand-ink' : 'border-transparent text-ink-faint hover:text-ink'}`}
        >
          Exam Preparations
        </button>
        <button
          type="button"
          onClick={() => setTab('offers')}
          className={`border-b-2 px-4 py-2 text-sm font-medium ${tab === 'offers' ? 'border-brand-500 text-brand-ink' : 'border-transparent text-ink-faint hover:text-ink'}`}
        >
          Scheduled Offers
        </button>
      </div>

      {tab === 'certifications' && (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <Link
              to="/admin/products/new"
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
            >
              + Create New
            </Link>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search exam preparations…"
              className="input-dark w-56"
            />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className="input-dark w-40">
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="scheduled">Scheduled</option>
              <option value="published">Published</option>
              <option value="unpublished">Unpublished</option>
              <option value="archived">Archived</option>
            </select>
            <select value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)} className="input-dark w-40">
              <option value="all">All providers</option>
              {providers.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className="input-dark w-48">
              <option value="displayOrder">Sort: Display order</option>
              <option value="name">Sort: Name</option>
              <option value="updated">Sort: Last updated</option>
            </select>
          </div>

          {isLoading && (
            <div className="space-y-3">
              <CertRowSkeleton />
              <CertRowSkeleton />
            </div>
          )}
          {!isLoading && hasError && (
            <div className="rounded-lg border border-surface-border bg-surface-raised p-4 text-sm text-ink-faint">
              We couldn't load the product catalog.{' '}
              <button type="button" onClick={() => refetchCerts()} className="font-semibold text-brand-ink hover:underline">
                Retry
              </button>
            </div>
          )}
          {!isLoading && !hasError && filtered.length === 0 && (
            <div className="rounded-xl border border-dashed border-surface-border p-8 text-center">
              <p className="mb-4 text-ink-faint">No exam preparations have been configured.</p>
              <Link to="/admin/products/new" className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">
                + Create New
              </Link>
            </div>
          )}
          {!isLoading && !hasError && filtered.length > 0 && (
            <div className="space-y-3">
              {filtered.map((cert) => (
                <CertificationRow
                  key={cert.id}
                  certification={cert}
                  packages={packagesByCert.get(cert.id) ?? []}
                  onDelete={async () => {
                    if (
                      await confirmDialog({
                        title: `Delete "${cert.name}"?`,
                        message:
                          'This permanently removes the exam preparation and all of its packages. It cannot be undone. (Products with real purchase history must be archived instead.)',
                        confirmLabel: 'Delete',
                        danger: true,
                      })
                    )
                      deleteMutation.mutate(cert.id);
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'offers' && (
        <ScheduledOffersTab
          certifications={certifications}
          packages={packages}
          onCancel={(packageId) => cancelOfferMutation.mutate(packageId)}
        />
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-raised p-4">
      <div className="text-xs uppercase tracking-wide text-ink-faint">{label}</div>
      <div className="mt-1 text-2xl font-bold text-ink">{value}</div>
    </div>
  );
}

function CertRowSkeleton() {
  return (
    <div className="flex animate-pulse gap-4 rounded-xl border border-surface-border bg-surface-raised p-5">
      <div className="h-12 w-12 shrink-0 rounded-xl bg-brand-50" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-48 rounded bg-brand-50" />
        <div className="h-3 w-72 rounded bg-brand-50" />
      </div>
    </div>
  );
}

function CertificationRow({
  certification,
  packages,
  onDelete,
}: {
  certification: CertificationAdminRow;
  packages: PackageAdminRow[];
  onDelete: () => void;
}) {
  const sortedPackages = [...packages].sort((a, b) => a.displayOrder - b.displayOrder);
  const recommended = sortedPackages.find((p) => p.isRecommended);
  const bankTitles = Array.from(
    new Set(
      certification.contentVersions.map((v) => `${v.associatedBankType === 'quiz' ? 'Mock Exam' : 'Practice Test'} bank (${v.versionName})`)
    )
  );
  const totalAccessibleQuestions = sortedPackages.reduce((sum, p) => sum + (p.accessibleQuestionCount ?? 0), 0);
  const totalMockAttempts = sortedPackages.reduce((sum, p) => sum + (p.fullMockAttempts ?? 0), 0);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-surface-border bg-surface-raised p-5 lg:flex-row lg:items-start">
      <div className="flex items-start gap-3 lg:w-64 lg:shrink-0">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-lg font-bold text-white">
          {certification.shortName.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-ink-faint">{certification.provider}</div>
          <div className="font-semibold text-ink">{certification.name}</div>
          <div className="text-xs text-ink-faint">{certification.shortName}</div>
          {bankTitles.length > 0 && <div className="mt-1 text-xs text-ink-faint">{bankTitles.join(', ')}</div>}
          <div className="mt-1 text-xs text-ink-faint">
            {totalAccessibleQuestions > 0 && `${totalAccessibleQuestions} questions`}
            {totalAccessibleQuestions > 0 && totalMockAttempts > 0 && ' · '}
            {totalMockAttempts > 0 && `${totalMockAttempts} mock attempts`}
          </div>
        </div>
      </div>

      <div className="flex-1">
        <div className="mb-2 flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${STATUS_BADGE[certification.status]}`}>
            {certification.status}
          </span>
          {certification.featured && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-ink">Featured</span>}
          <span className="text-xs text-ink-faint">Updated {toDate(certification.updatedAt).toLocaleDateString()}</span>
        </div>
        {sortedPackages.length === 0 ? (
          <p className="text-sm text-ink-faint">No packages configured yet.</p>
        ) : (
          <div className="space-y-1 text-sm">
            {sortedPackages.map((pkg) => (
              <div key={pkg.id} className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium text-ink">{pkg.name}</span>
                <span className="text-ink-faint">·</span>
                <span className="font-semibold text-ink">{pkg.isFree ? 'Free' : formatMoney(pkg.sellingPrice, pkg.currency)}</span>
                {pkg.regularPrice > pkg.sellingPrice && (
                  <span className="text-xs text-ink-faint line-through">{formatMoney(pkg.regularPrice, pkg.currency)}</span>
                )}
                {pkg.mockAccessEnabled && <span className="text-xs text-ink-faint">{pkg.fullMockAttempts} mock attempts</span>}
                {pkg.practiceAccessEnabled && <span className="text-xs text-ink-faint">{pkg.accessibleQuestionCount} questions</span>}
                {pkg.badgeText && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">{pkg.badgeText}</span>}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold capitalize ${pkg.status === 'published' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-surface-sunken text-ink-faint'}`}>
                  {pkg.status}
                </span>
              </div>
            ))}
          </div>
        )}
        {recommended && <div className="mt-2 text-xs text-ink-faint">Recommended: {recommended.name}</div>}
      </div>

      <div className="flex shrink-0 flex-wrap gap-2 lg:flex-col">
        <Link
          to={`/admin/products/${certification.id}`}
          className="rounded-lg border border-surface-border px-3 py-1.5 text-center text-sm text-ink-muted hover:border-brand-400"
        >
          Edit
        </Link>
        <Link
          to={`/admin/products/${certification.id}?preview=1`}
          className="rounded-lg border border-surface-border px-3 py-1.5 text-center text-sm text-ink-muted hover:border-brand-400"
        >
          Preview
        </Link>
        <button type="button" onClick={onDelete} className="rounded-lg border border-surface-border px-3 py-1.5 text-sm font-medium text-danger hover:border-danger hover:bg-danger-soft">
          Delete
        </button>
      </div>
    </div>
  );
}

function ScheduledOffersTab({
  certifications,
  packages,
  onCancel,
}: {
  certifications: CertificationAdminRow[];
  packages: PackageAdminRow[];
  onCancel: (packageId: string) => void;
}) {
  const certById = new Map(certifications.map((c) => [c.id, c]));
  const now = new Date();
  const offerPackages = packages
    .filter((p) => p.offerPrice !== null)
    .map((p) => ({
      pkg: p,
      status: computeOfferStatus(
        { offerPrice: p.offerPrice, offerStart: toDateOrNull(p.offerStart), offerEnd: toDateOrNull(p.offerEnd), offerCancelledAt: toDateOrNull(p.offerCancelledAt) },
        now
      ),
    }));

  if (offerPackages.length === 0) {
    return <p className="rounded-xl border border-dashed border-surface-border p-8 text-center text-sm text-ink-faint">No offers have been scheduled yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-surface-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface-sunken text-ink-faint text-xs uppercase tracking-wide text-ink-faint">
          <tr>
            <th className="px-4 py-3">Exam Preparation</th>
            <th className="px-4 py-3">Package</th>
            <th className="px-4 py-3">Regular</th>
            <th className="px-4 py-3">Offer</th>
            <th className="px-4 py-3">Start</th>
            <th className="px-4 py-3">End</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {offerPackages.map(({ pkg, status }) => (
            <tr key={pkg.id} className="border-t border-surface-border">
              <td className="px-4 py-3 text-ink">{certById.get(pkg.certificationId)?.name ?? pkg.certificationId}</td>
              <td className="px-4 py-3 text-ink-muted">{pkg.name}</td>
              <td className="px-4 py-3 text-ink-faint">{formatMoney(pkg.regularPrice, pkg.currency)}</td>
              <td className="px-4 py-3 font-semibold text-ink">{pkg.offerPrice !== null ? formatMoney(pkg.offerPrice, pkg.currency) : 'N/A'}</td>
              <td className="px-4 py-3 text-ink-faint">{pkg.offerStart ? toDate(pkg.offerStart).toLocaleString() : 'N/A'}</td>
              <td className="px-4 py-3 text-ink-faint">{pkg.offerEnd ? toDate(pkg.offerEnd).toLocaleString() : 'N/A'}</td>
              <td className="px-4 py-3">
                <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${OFFER_STATUS_BADGE[status]}`}>{status}</span>
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-2">
                  <Link to={`/admin/products/${pkg.certificationId}`} className="text-xs font-medium text-brand-ink hover:underline">
                    Edit
                  </Link>
                  {(status === 'scheduled' || status === 'active') && (
                    <button type="button" onClick={() => onCancel(pkg.id)} className="text-xs font-medium text-red-500 hover:underline">
                      Cancel
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
