import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { adminApi } from '../api/adminApi';

const ACTIONS = [
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
    body: 'Review student rankings, attempts, and quiz analytics from one place.',
  },
];

export function AdminHomePage() {
  const { data: stats } = useQuery({ queryKey: ['admin', 'dashboardStats'], queryFn: adminApi.getDashboardStats });

  return (
    <div>
      <div className="mb-1 text-xs uppercase tracking-wide text-ink-faint">Admin Portal</div>
      <h1 className="mb-8 text-2xl font-bold text-ink">Welcome, Admin</h1>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="Total Quizzes" value={stats?.totalQuizzes} />
        <StatCard label="Practice Exams" value={stats?.totalPracticeTests} />
        <StatCard label="Student Attempts" value={stats?.studentAttempts} />
        <StatCard label="Admin Accounts" value={stats?.adminAccounts} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
