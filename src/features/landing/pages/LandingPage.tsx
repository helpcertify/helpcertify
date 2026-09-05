import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/brand/Logo';
import { useCompany } from '@/features/marketing/companyInfoStore';
import { useCaptureReferral } from '@/features/partner/hooks/useCaptureReferral';
import { CertificationGoalSelector } from '@/features/landing/components/CertificationGoalSelector';
import { SearchBar } from '@/components/common/SearchBar';
import { TeachBand } from '@/features/landing/components/TeachBand';
import { TESTIMONIALS } from '@/features/landing/lib/testimonials';
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

// Same reasoning: the catalog carousels fetch real published content
// through a dynamic import() of publicCatalogApi (Firebase at module
// scope). Kept behind a lazy() boundary so the prerender never reaches it;
// the prerendered HTML keeps its own crawlable text sections below.
const LandingCatalogRows = lazy(() =>
  import('@/features/landing/components/LandingCatalogRows').then((m) => ({
    default: m.LandingCatalogRows,
  })),
);

// Broad domain filters. Each links into the public /search page's category
// filter so a visitor can browse real content without an account.
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
    href: '/register',
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

export function LandingPage() {
  const [showAdminAccess, setShowAdminAccess] = useState(false);
  const COMPANY = useCompany();
  useCaptureReferral();

  return (
    <div className="min-h-screen bg-surface">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-6">
        <Logo />
        <div className="order-3 w-full sm:order-2 sm:w-auto sm:flex-1">
          <SearchBar to="/search" className="mx-auto max-w-md" />
        </div>
        {/* No theme toggle here on request - it moved to the login screens
            (Admin Access modal and the student LoginPage) instead. */}
        <div className="order-2 ml-auto flex items-center gap-2 sm:order-3">
          <Link
            to="/login"
            className="rounded-lg px-4 py-2 text-sm font-medium text-ink-muted hover:text-ink"
          >
            Log in
          </Link>
          <Link
            to="/register"
            className="rounded-lg bg-[#155EEF] px-4 py-2 text-sm font-semibold text-surface"
          >
            Sign up
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

      <main className="mx-auto max-w-4xl px-6 pb-20 pt-10 text-center">
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

        <CertificationGoalSelector />

        <div className="mx-auto mt-8 max-w-xl">
          <SearchBar to="/search" variant="block" placeholder="Search courses, practice tests and certifications" />
        </div>
        <p className="mt-4 text-sm text-ink-faint">
          Already have an account?{' '}
          <Link to="/login" className="text-brand-ink underline">
            Log in
          </Link>
        </p>

        <div className="mt-14 flex flex-wrap justify-center gap-2">
          {DOMAINS.map((d) => (
            <Link
              key={d}
              to={`/search?category=${encodeURIComponent(d)}`}
              className="rounded-full border border-surface-border bg-surface-raised px-4 py-1.5 text-sm text-ink-muted hover:border-brand-400"
            >
              {d}
            </Link>
          ))}
        </div>
      </main>

      {/* Real published content - JS-rendered enhancement on top of the
          crawlable text sections below. Renders nothing if it can't load. */}
      <Suspense fallback={null}>
        <LandingCatalogRows />
      </Suspense>

      {/* Audience section - so a first-time visitor sees in one glance that
          HelpCertify serves experienced professionals and career
          starters/switchers alike. */}
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

      {/* Explore Learning Paths - broad technology/domain filters plus a
          handful of level-tagged example paths so an experienced
          professional immediately sees Professional/Advanced content, not
          only Foundation material. */}
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

      {/* Certification Exam Preparation - the crawlable exam-prep-areas text
          stays here (not behind JavaScript). */}
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

      {/* What learners say */}
      <section className="border-t border-surface-border py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-2xl font-bold text-ink">What learners say</h2>
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <figure key={t.attribution} className="flex flex-col rounded-xl border border-surface-border bg-surface-raised p-6 text-left">
                <blockquote className="flex-1 text-sm text-ink-muted">"{t.quote}"</blockquote>
                <figcaption className="mt-4 text-xs font-medium text-ink-faint">{t.attribution}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <TeachBand />

      {/* Build Your Own Exams - now a one-line promo band. */}
      <section className="border-t border-surface-border py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink-muted">
            <span className="font-semibold text-ink">Your questions. Your exam. Your learners.</span>{' '}
            Upload a question bank and run professional practice tests, mock exams or private
            assessments.
          </p>
          <Link to="/build-your-own-exam" className="shrink-0 text-sm font-semibold text-brand-ink hover:underline">
            Bring your own question bank &rarr;
          </Link>
        </div>
      </section>

      <footer className="border-t border-surface-border py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Logo size="sm" />
            <p className="mt-2 max-w-sm text-sm text-ink-faint">
              Build and advance your skills, prepare for professional certifications, assess your
              knowledge, or create and sell learning content - all in one platform.
            </p>
            <p className="mt-3 max-w-sm text-xs text-ink-faint">
              {/* Literal operator name so this ownership sentence is one
                  unbroken string in the prerendered HTML for
                  URL-classification crawlers. */}
              HelpCertify is an independent learning, certification-preparation and assessment platform operated by IndyaBees.
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
