import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { adminApi } from '../api/adminApi';
import { contentAdminApi } from '../api/contentAdminApi';
import { computeOfferStatus } from '../lib/offerStatus';
import { toDate } from '@/utils/formatDate';

const ACTIONS = [
  {
    to: '/admin/products/new',
    title: 'Create Certification',
    body: 'Add a new certification, connect a question bank, and configure its packages.',
  },
  {
    to: '/admin/quizzes',
    title: 'Create Exam Quiz',
    body: 'Publish a new timed quiz with strict navigation and scoring options.',
  },
  {
    to: '/admin/practice-tests',
    title: 'Create Practice Test',
    body: 'Configure batch-based practice sessions with resume and reattempt workflows.',
  },
  {
    to: '/admin/performance',
    title: 'View Learner Analytics',
    body: 'Review learner rankings, attempts, and quiz analytics from one place.',
  },
];

export function AdminHomePage() {
  const { data: stats } = useQuery({ queryKey: ['admin', 'dashboardStats'], queryFn: adminApi.getDashboardStats });
  const { data: certData } = useQuery({ queryKey: ['admin', 'certifications'], queryFn: contentAdminApi.listCertificationsAdmin });
  const { data: pkgData } = useQuery({ queryKey: ['admin', 'packages'], queryFn: () => contentAdminApi.listPackagesAdmin() });

  const certifications = certData?.certifications ?? [];
  const packages = pkgData?.packages ?? [];
  const now = new Date();
  const activeOfferCount = packages.filter(
    (p) =>
      computeOfferStatus(
        {
          offerPrice: p.offerPrice,
          offerStart: p.offerStart ? toDate(p.offerStart) : null,
          offerEnd: p.offerEnd ? toDate(p.offerEnd) : null,
          offerCancelledAt: p.offerCancelledAt ? toDate(p.offerCancelledAt) : null,
        },
        now
      ) === 'active'
  ).length;

  return (
    <div>
      <div className="mb-1 text-xs uppercase tracking-wide text-ink-faint">Admin Portal</div>
      <h1 className="mb-8 text-2xl font-bold text-ink">Welcome, Admin</h1>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="Total Quizzes" value={stats?.totalQuizzes} />
        <StatCard label="Practice Exams" value={stats?.totalPracticeTests} />
        <StatCard label="Learner Attempts" value={stats?.studentAttempts} />
        <StatCard label="Admin Accounts" value={stats?.adminAccounts} />
      </div>

      {/* Products & Pricing summary - kept to three small cards plus one
          "manage" link, not a second dashboard, per request not to
          overcrowd this page. */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="Certifications" value={certifications.length} />
        <StatCard label="Active Packages" value={packages.filter((p) => p.status === 'published').length} />
        <StatCard label="Scheduled Offers" value={activeOfferCount} />
        <Link
          to="/admin/products"
          className="flex flex-col justify-center rounded-xl border border-surface-border bg-surface-raised p-5 text-sm font-medium text-[#155EEF] hover:border-brand-400"
        >
          Manage Products & Pricing →
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ACTIONS.map((action) => (
          <Link
            key={action.to}
            to={action.to}
            className="rounded-xl border border-surface-border bg-surface-raised p-6 transition hover:border-brand-400"
          >
            <h3 className="mb-2 font-bold text-ink">{action.title}</h3>
            <p className="text-sm text-ink-faint">{action.body}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-raised p-5">
      <div className="text-xs uppercase tracking-wide text-ink-faint">{label}</div>
      <div className="mt-2 text-2xl font-bold text-ink">{value ?? 'N/A'}</div>
    </div>
  );
}
