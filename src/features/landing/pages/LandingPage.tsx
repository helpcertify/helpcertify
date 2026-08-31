import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/brand/Logo';
import { useCompany } from '@/features/marketing/companyInfoStore';

// Lazy so the admin-login form (and the Firebase Auth code it pulls in) is
// neither in the initial bundle nor in the build-time prerender module
// graph — scripts/prerender.mjs renders this page to static HTML and must
// not evaluate Firebase. Only loads when the Admin Portal button is used.
const AdminAccessModal = lazy(() =>
  import('@/features/auth/components/AdminAccessModal').then((m) => ({
    default: m.AdminAccessModal,
  })),
);

const DOMAINS = ['Cybersecurity', 'Cloud', 'IT & Infrastructure', 'AI & Machine Learning', 'Project Management'];

// Kept in the prerendered HTML (not behind JavaScript) so URL-classification
// and search crawlers can read, without authenticating, exactly what kind of
// service this is: professional certification exam preparation.
const EXAM_PREP_AREAS = [
  'Cybersecurity certification preparation',
  'Cloud certification preparation',
  'IT certification preparation',
  'AI / machine-learning certification preparation',
  'Project-management certification preparation',
];

const WHAT_YOU_GET = [
  'Practice questions',
  'Mock exams',
  'Certification exam practice',
  'Professional certification training',
  'Exam-readiness analytics',
];

const FEATURES = [
  {
    title: 'Practise your weak areas',
    body: 'Large question banks in resumable, batched sessions — plus a focused mode that resurfaces the questions you get wrong most.',
  },
  {
    title: 'Detailed analytics',
    body: 'Ranked results with a per-question breakdown, so you and your admin can see exactly where to focus next.',
  },
  {
    title: 'Instant explanations',
    body: 'Practice mode tells you right away whether an answer was correct, with the reasoning behind it.',
  },
];

export function LandingPage() {
  const [showAdminAccess, setShowAdminAccess] = useState(false);
  const COMPANY = useCompany();

  return (
    <div className="min-h-screen bg-surface">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Logo />
        {/* No theme toggle here on request — it moved to the login screens
            (Admin Access modal and the student LoginPage) instead. */}
        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className="rounded-lg px-4 py-2 text-sm font-medium text-ink-muted hover:text-ink"
          >
            Log in
          </Link>
          <button
            type="button"
            onClick={() => setShowAdminAccess(true)}
            className="rounded-lg border border-surface-border bg-surface-raised px-4 py-2 text-sm font-medium text-ink-muted hover:border-brand-400"
          >
            Admin Portal
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 pb-24 pt-10 text-center">
        <span className="mb-6 inline-block rounded-full border border-brand-500/40 bg-brand-500/10 px-4 py-1 text-xs font-medium text-brand-ink">
          Certification exam preparation
        </span>
        <h1 className="text-4xl font-bold leading-tight text-ink sm:text-5xl">
          Master Your Certification Exam
          <br />
          <span className="text-brand-ink">with Focused Practice</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-ink-faint">
          {/* Literal operator name (not the {COMPANY} store value) so this
              ownership sentence is one unbroken string in the prerendered
              HTML for URL-classification crawlers. */}
          <strong className="text-ink-muted">
            HelpCertify is an online certification exam-preparation and practice platform operated by IndyaBees.
          </strong>{' '}
          It provides practice questions, mock exams, a detailed explanation for every question, a
          study plan built around your exam date, and domain-level analytics &mdash; for students
          and professionals preparing for IT, cybersecurity, cloud, AI/ML, and project-management
          certification exams. HelpCertify is an independent study aid and is not affiliated with,
          endorsed by, or sponsored by any certification body.
        </p>

        <ul className="mx-auto mt-6 flex max-w-2xl flex-wrap justify-center gap-2 text-sm text-ink-faint">
          {WHAT_YOU_GET.map((item) => (
            <li
              key={item}
              className="rounded-full border border-surface-border bg-surface-raised px-3 py-1"
            >
              {item}
            </li>
          ))}
        </ul>
        <Link
          to="/register"
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#155EEF] px-6 py-3 font-medium text-surface"
        >
          Get Started →
        </Link>
        <p className="mt-4 text-sm text-ink-faint">
          Already have an account?{' '}
          <Link to="/login" className="text-brand-ink underline">
            Log in
          </Link>
        </p>

        <div className="mt-14 flex flex-wrap justify-center gap-2">
          {DOMAINS.map((d) => (
            <span
              key={d}
              className="rounded-full border border-surface-border bg-surface-raised px-4 py-1.5 text-sm text-ink-muted"
            >
              {d}
            </span>
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

      <section className="border-t border-surface-border py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-2xl font-bold text-ink">Certification exam preparation we cover</h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-faint">
            HelpCertify is a professional-education service focused on certification
            exam readiness. Practice sets and mock exams are available for:
          </p>
          <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {EXAM_PREP_AREAS.map((area) => (
              <li
                key={area}
                className="rounded-lg border border-surface-border bg-surface-raised px-4 py-3 text-sm text-ink-muted"
              >
                {area}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <footer className="border-t border-surface-border py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Logo size="sm" />
            <p className="mt-2 max-w-sm text-sm text-ink-faint">
              Online certification exam preparation and professional education: mock exams,
              practice questions, explanations, and analytics in one place.
            </p>
          </div>
          <div className="flex flex-col gap-2 text-sm text-ink-faint sm:items-end">
            <div className="flex flex-wrap gap-x-4 gap-y-1 sm:justify-end">
              <Link to="/about" className="hover:text-ink-muted">About</Link>
              <Link to="/contact" className="hover:text-ink-muted">Contact</Link>
              <Link to="/privacy" className="hover:text-ink-muted">Privacy Policy</Link>
              <Link to="/terms" className="hover:text-ink-muted">Terms of Service</Link>
              <Link to="/refund" className="hover:text-ink-muted">Refund Policy</Link>
              <Link to="/support" className="hover:text-ink-muted">Support</Link>
            </div>
            <span>© {new Date().getFullYear()} {COMPANY.operatorName}. HelpCertify is a product and service of {COMPANY.operatorName}.</span>
          </div>
        </div>
      </footer>

      {showAdminAccess && (
        <Suspense fallback={null}>
          <AdminAccessModal onClose={() => setShowAdminAccess(false)} />
        </Suspense>
      )}
    </div>
  );
}
