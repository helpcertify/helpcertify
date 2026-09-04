import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/brand/Logo';
import { useCompany } from '@/features/marketing/companyInfoStore';
import { useCaptureReferral } from '@/features/partner/hooks/useCaptureReferral';
import { CertificationGoalSelector } from '@/features/landing/components/CertificationGoalSelector';
import { LEARNING_DOMAINS, LEARNING_PATH_EXAMPLES } from '@/features/landing/lib/learningPaths';

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

// "Designed for every stage of your career" - the audience section
// immediately below the hero, so a first-time visitor sees in one glance
// that HelpCertify serves experienced professionals and career
// starters/switchers alike, not just one of the two.
const AUDIENCE_CARDS = [
  {
    title: 'IT Professionals',
    subtitle: 'Advance your expertise',
    body: 'Build advanced technical skills, prepare for professional certifications, practice with realistic assessments and measure your readiness.',
    cta: 'Explore Professional Learning',
    href: '#learning-paths',
  },
  {
    title: 'Career Starters & Switchers',
    subtitle: 'Build the right foundation',
    body: 'Explore IT career paths, understand prerequisites and build skills progressively from fundamentals to job-ready capability.',
    cta: 'Explore Career Paths',
    href: '#learning-paths',
  },
  {
    title: 'Trainers & Experts',
    subtitle: 'Share what you know',
    body: 'Create courses, assessments and question banks and make them available to HelpCertify learners.',
    cta: 'Become a Training Partner',
    href: '/home/become-a-partner',
  },
];

const LEVEL_BADGE_CLASS: Record<string, string> = {
  Foundation: 'border-surface-border bg-surface-raised text-ink-muted',
  Professional: 'border-brand-500/40 bg-brand-500/10 text-brand-ink',
  Advanced: 'border-brand-500/60 bg-brand-500/20 text-brand-ink',
};

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
          Learning &bull; Certification &bull; Assessment Platform
        </span>
        <h1 className="text-4xl font-bold leading-tight text-ink sm:text-5xl">
          Learn. Practice. Assess. <span className="text-brand-ink">Advance.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-ink-faint">
          Build and advance your skills, prepare for professional certifications, assess your
          knowledge, or create and sell learning content - all in one platform.
        </p>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-ink-faint">
          {/* Literal operator name (not the {COMPANY} store value) so this
              ownership sentence is one unbroken string in the prerendered
              HTML for URL-classification crawlers. */}
          <strong className="text-ink-muted">
            HelpCertify is an independent learning, certification-preparation and assessment platform operated by IndyaBees.
          </strong>
        </p>

        <CertificationGoalSelector />

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href="#learning-paths"
            className="inline-flex items-center gap-2 rounded-full bg-[#155EEF] px-6 py-3 font-medium text-surface"
          >
            Explore Learning
          </a>
          <Link
            to="/register"
            className="inline-flex items-center gap-2 rounded-full border border-surface-border bg-surface-raised px-6 py-3 font-medium text-ink hover:border-brand-400"
          >
            Prepare for Certification
          </Link>
          <Link
            to="/register"
            className="inline-flex items-center gap-2 rounded-full border border-surface-border bg-surface-raised px-6 py-3 font-medium text-ink hover:border-brand-400"
          >
            Start Creating
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

      {/* Audience section - immediately below the hero, so a first-time
          visitor sees in one glance that HelpCertify serves experienced
          professionals and career starters/switchers alike. */}
      <section className="border-t border-surface-border py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-2xl font-bold text-ink">Designed for every stage of your career</h2>
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {AUDIENCE_CARDS.map((card) => (
              <div
                key={card.title}
                className="flex flex-col rounded-xl border border-surface-border bg-surface-raised p-6 text-left"
              >
                <h3 className="font-bold text-ink">{card.title}</h3>
                <p className="mt-1 text-sm font-medium text-brand-ink">{card.subtitle}</p>
                <p className="mt-3 flex-1 text-sm text-ink-faint">{card.body}</p>
                {card.href.startsWith('#') ? (
                  <a href={card.href} className="mt-4 text-sm font-semibold text-brand-ink hover:underline">
                    {card.cta} &rarr;
                  </a>
                ) : (
                  <Link to={card.href} className="mt-4 text-sm font-semibold text-brand-ink hover:underline">
                    {card.cta} &rarr;
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Explore Learning Paths - broad technology/domain filters (kept
          separate from the intent-selector pills above, which are framed as
          goals, not technologies) plus a handful of level-tagged example
          paths so an experienced professional immediately sees
          Professional/Advanced content, not only Foundation material. */}
      <section id="learning-paths" className="border-t border-surface-border bg-black/20 py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-2xl font-bold text-ink">Explore Learning Paths</h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-faint">
            Foundation, Professional, and Advanced content across every domain - enter where your
            experience puts you, not necessarily at the beginning.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {LEARNING_DOMAINS.map((d) => (
              <span
                key={d}
                className="rounded-full border border-surface-border bg-surface-raised px-4 py-1.5 text-sm text-ink-muted"
              >
                {d}
              </span>
            ))}
          </div>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {LEARNING_PATH_EXAMPLES.map((p) => (
              <div key={p.id} className="rounded-lg border border-surface-border bg-surface-raised p-4 text-left">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">{p.domain}</p>
                <h3 className="mt-1 font-semibold text-ink">{p.title}</h3>
                <span
                  className={`mt-2 inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${LEVEL_BADGE_CLASS[p.level]}`}
                >
                  {p.level}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

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
              Build and advance your skills, prepare for professional certifications, assess your
              knowledge, or create and sell learning content - all in one platform.
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
