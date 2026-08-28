import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/brand/Logo';
import { AdminAccessModal } from '@/features/auth/components/AdminAccessModal';

const STATS = [
  { label: 'Certifications', value: '3+' },
  { label: 'Learners', value: '10k+' },
  { label: 'Success Rate', value: '95%' },
];

const FEATURES = [
  {
    title: 'Adaptive Practice',
    body: 'Large question banks you can work through in resumable, batched sessions, picking up exactly where you left off.',
  },
  {
    title: 'Real-time Analytics',
    body: 'Ranked results with per-question breakdowns, so you and your admin can see exactly where to focus next.',
  },
  {
    title: 'Instant Feedback',
    body: 'Practice mode tells you right away whether an answer was correct, with the reasoning behind it.',
  },
];

export function LandingPage() {
  const [showAdminAccess, setShowAdminAccess] = useState(false);

  return (
    <div className="min-h-screen bg-surface">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Logo />
        {/* No theme toggle here on request — it moved to the login screens
            (Admin Access modal and the student LoginPage) instead. */}
        <button
          type="button"
          onClick={() => setShowAdminAccess(true)}
          className="rounded-lg border border-surface-border bg-surface-raised px-4 py-2 text-sm font-medium text-ink-muted hover:border-brand-400"
        >
          Admin Portal
        </button>
      </header>

      <main className="mx-auto max-w-4xl px-6 pb-24 pt-10 text-center">
        <span className="mb-6 inline-block rounded-full border border-brand-500/40 bg-brand-500/10 px-4 py-1 text-xs font-medium text-brand-ink">
          Revolutionizing Certification Prep Through AI
        </span>
        <h1 className="text-4xl font-bold leading-tight text-ink sm:text-5xl">
          Master Your Certification with
          <br />
          <span className="text-brand-ink">Intelligent Practice</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-ink-faint">
          Timed exam quizzes, resumable practice tests, and ranked results built around real exam content.
          Personalized for your success.
        </p>
        <Link
          to="/register"
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#155EEF] px-6 py-3 font-medium text-surface"
        >
          Get Started →
        </Link>

        <div className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {STATS.map((s) => (
            <div key={s.label} className="rounded-xl border border-surface-border bg-surface-raised p-6">
              <div className="text-2xl font-bold text-brand-ink">{s.value}</div>
              <div className="mt-1 text-sm text-ink-faint">{s.label}</div>
            </div>
          ))}
        </div>
      </main>

      <section className="border-t border-surface-border bg-black/20 py-16">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-6 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border border-surface-border bg-surface-raised p-6">
              <h3 className="mb-2 font-bold text-ink">{f.title}</h3>
              <p className="text-sm text-ink-faint">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-surface-border py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Logo size="sm" />
            <p className="mt-2 max-w-sm text-sm text-ink-faint">
              Certification exam prep built around real practice: quizzes, practice tests, and results in one place.
            </p>
          </div>
          <div className="flex flex-col gap-2 text-sm text-ink-faint sm:items-end">
            <div className="flex gap-4">
              <Link to="/privacy" className="hover:text-ink-muted">
                Privacy Policy
              </Link>
              <Link to="/terms" className="hover:text-ink-muted">
                Terms of Service
              </Link>
            </div>
            <span>© {new Date().getFullYear()} Helpcertify. All rights reserved.</span>
          </div>
        </div>
      </footer>

      {showAdminAccess && <AdminAccessModal onClose={() => setShowAdminAccess(false)} />}
    </div>
  );
}
