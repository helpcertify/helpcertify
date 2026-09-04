import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/brand/Logo';
import { useCompany } from '@/features/marketing/companyInfoStore';
import { useCaptureReferral } from '@/features/partner/hooks/useCaptureReferral';
import { CertificationGoalSelector } from '@/features/landing/components/CertificationGoalSelector';

// Lazy so the admin-login form (and the Firebase Auth code it pulls in) is
// neither in the initial bundle nor in the build-time prerender module
// graph - scripts/prerender.mjs renders this page to static HTML and must
// not evaluate Firebase. Only loads when the Admin Portal button is used.
const AdminAccessModal = lazy(() =>
  import('@/features/auth/components/AdminAccessModal').then((m) => ({
    default: m.AdminAccessModal,
  })),
);

const DOMAINS = ['Cybersecurity', 'Cloud', 'IT & Infrastructure', 'AI & Machine Learning', 'Project Management'];

// Kept in the prerendered HTML (not behind JavaScript) so URL-classification
// and search crawlers can read, without authenticating, exactly what kind of
// service this is: professional certification exam preparation. Wording
// stays broad (no individual certification names) per the homepage
// repositioning brief.
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

// Certification Exam Preparation's supporting capability cards.
const EXAM_PREP_FEATURES = [
  {
    title: 'Practise your weak areas',
    body: 'Large practice question banks in resumable, batched sessions - plus a focused mode that resurfaces the questions you get wrong most.',
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

const LEARN_SKILLS_CAPABILITIES = [
  'Structured courses',
  'Learning content',
  'Quizzes',
  'Progress tracking',
  'Skill assessments',
  'Completion certificates',
];

const CREATE_SELL_CAPABILITIES = [
  'Create courses',
  'Upload learning content',
  'Create quizzes',
  'Create question banks',
  'Create practice tests',
  'Create mock exams',
  'Set pricing',
  'Publish content',
  'Track learner performance',
];

const BUILD_EXAM_CAPABILITIES = [
  'Upload question banks',
  'Practice mode',
  'Mock exam mode',
  'Exam duration',
  'Pass marks',
  'Randomized questions',
  'Private or public exams',
  'Candidate scorecards',
  'Performance analytics',
  'Certificates where applicable',
];

function CapabilityPills({ items }: { items: string[] }) {
  return (
    <ul className="mt-4 flex flex-wrap gap-2">
      {items.map((item) => (
        <li
          key={item}
          className="rounded-full border border-surface-border bg-surface-raised px-3 py-1 text-sm text-ink-muted"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

export function LandingPage() {
  const [showAdminAccess, setShowAdminAccess] = useState(false);
  const COMPANY = useCompany();
  useCaptureReferral();

  return (
    <div className="min-h-screen bg-surface">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Logo />
        {/* No theme toggle here on request - it moved to the login screens
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
          Learning, Certification &amp; Assessment Platform
        </span>
        <h1 className="text-4xl font-bold leading-tight text-ink sm:text-5xl">
          Learn. Practice. Teach. <span className="text-brand-ink">Assess.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-ink-faint">
          Build job-ready skills, prepare for professional certifications, create and sell
          courses, or build your own exams - all in one platform.
        </p>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-ink-faint">
          {/* Literal operator name (not the {COMPANY} store value) so this
              ownership sentence is one unbroken string in the prerendered
              HTML for URL-classification crawlers. */}
          <strong className="text-ink-muted">
            HelpCertify is an online certification exam-preparation and practice platform operated by IndyaBees.
          </strong>
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

        <CertificationGoalSelector />

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/register"
            className="inline-flex items-center gap-2 rounded-full bg-[#155EEF] px-6 py-3 font-medium text-surface"
          >
            Explore Learning
          </Link>
          <Link
            to="/register"
            className="inline-flex items-center gap-2 rounded-full border border-surface-border bg-surface-raised px-6 py-3 font-medium text-ink hover:border-brand-400"
          >
            Start Creating
          </Link>
          <Link
            to="/build-your-own-exam"
            className="inline-flex items-center gap-2 rounded-full border border-surface-border bg-surface-raised px-6 py-3 font-medium text-ink hover:border-brand-400"
          >
            Build an Exam
          </Link>
        </div>
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

      {/* Product area 1: Certification Exam Preparation */}
      <section className="border-t border-surface-border py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-2xl font-bold text-ink">Certification Exam Preparation</h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-faint">
            Prepare for IT, cybersecurity, cloud and professional certifications with practice
            questions, mock exams, explanations and performance analytics.
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
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {EXAM_PREP_FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border border-surface-border bg-surface-raised p-6 text-left">
                <h3 className="mb-2 font-bold text-ink">{f.title}</h3>
                <p className="text-sm text-ink-faint">{f.body}</p>
              </div>
            ))}
          </div>
          <Link
            to="/register"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#155EEF] px-6 py-3 font-medium text-surface"
          >
            Explore Exam Preparation
          </Link>
        </div>
      </section>

      {/* Product area 2: Learn Career Skills */}
      <section className="border-t border-surface-border bg-black/20 py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-2xl font-bold text-ink">Learn Career Skills</h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-faint">
            Take structured training in cybersecurity, IT, cloud, software development and other
            career-focused skills.
          </p>
          <CapabilityPills items={LEARN_SKILLS_CAPABILITIES} />
          <Link
            to="/register"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#155EEF] px-6 py-3 font-medium text-surface"
          >
            Explore Courses
          </Link>
        </div>
      </section>

      {/* Product area 3: Create & Sell Courses */}
      <section className="border-t border-surface-border py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-2xl font-bold text-ink">Create &amp; Sell Courses</h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-faint">
            Enable trainers, professionals and subject-matter experts to create and sell their
            knowledge through HelpCertify.
          </p>
          <CapabilityPills items={CREATE_SELL_CAPABILITIES} />
          <Link
            to="/register"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#155EEF] px-6 py-3 font-medium text-surface"
          >
            Start Creating
          </Link>
        </div>
      </section>

      {/* Product area 4: Build Your Own Exams */}
      <section className="border-t border-surface-border bg-black/20 py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-2xl font-bold text-ink">Your Questions. Your Exam. Your Learners.</h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-faint">
            Upload your own question bank and create professional practice tests, mock exams,
            quizzes or private assessments without building your own examination platform.
          </p>
          <CapabilityPills items={BUILD_EXAM_CAPABILITIES} />
          <Link
            to="/build-your-own-exam"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#155EEF] px-6 py-3 font-medium text-surface"
          >
            Build an Exam
          </Link>
        </div>
      </section>

      <footer className="border-t border-surface-border py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Logo size="sm" />
            <p className="mt-2 max-w-sm text-sm text-ink-faint">
              Build job-ready skills, prepare for certifications, create and sell courses, or
              build your own exams - all in one platform.
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
