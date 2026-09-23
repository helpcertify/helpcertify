import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/brand/Logo';
import { useCompany } from '@/features/marketing/companyInfoStore';
import { useCaptureReferral } from '@/features/partner/hooks/useCaptureReferral';
import { CertificationGoalSelector } from '@/features/landing/components/CertificationGoalSelector';
import { SearchBar } from '@/components/common/SearchBar';
import { TeachBand } from '@/features/landing/components/TeachBand';
import { LEARNING_DOMAINS, LEARNING_PATH_EXAMPLES } from '@/features/landing/lib/learningPaths';

// Bold & Modern redesign (2026-09): the "What learners say" testimonials
// section was removed from this page. TESTIMONIALS itself (see
// src/features/landing/lib/testimonials.ts) is deliberately kept - it's
// generic-and-honest, admin-editable testimonials are still planned - it's
// just not rendered here any more, since the Certification Exam
// Preparation section's EXAM_PREP_FEATURES already covers "why HelpCertify"
// a few sections down and having both back-to-back read as repetitive.

// The catalog carousels fetch real published content
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
// starters/switchers alike, not just one of the two. Each card's `icon` is
// a tiny inline SVG path (stroke-based, 20x20 viewBox) so the icon inherits
// the card's brand-tinted icon-block color without a separate asset.
const AUDIENCE_CARDS = [
  {
    title: 'IT Professionals',
    subtitle: 'Advance your expertise',
    body: 'Build advanced technical skills, prepare for professional certifications, practice with realistic assessments and measure your readiness.',
    cta: 'Explore Professional Learning',
    href: '#learning-paths',
    // Shield / certification badge.
    icon: 'M10 2l6 2.5v5c0 4.2-2.6 7.4-6 8.5-3.4-1.1-6-4.3-6-8.5v-5L10 2z',
    accent: '#2F5FE0',
    accentSoft: '#EAF1FF',
  },
  {
    title: 'Career Starters & Switchers',
    subtitle: 'Build the right foundation',
    body: 'Explore IT career paths, understand prerequisites and build skills progressively from fundamentals to job-ready capability.',
    cta: 'Explore Career Paths',
    href: '#learning-paths',
    // Ascending bar chart / growth.
    icon: 'M3 17V10M8.5 17V6M14 17v-4.5M19 17V3',
    accent: '#0F766E',
    accentSoft: '#E6FBF7',
  },
  {
    title: 'Trainers & Experts',
    subtitle: 'Share what you know',
    body: 'Create courses, assessments and question banks and make them available to HelpCertify learners.',
    cta: 'Become a Training Partner',
    href: '/register',
    // Briefcase / stack.
    icon: 'M3 8.5A1.5 1.5 0 014.5 7h11A1.5 1.5 0 0117 8.5v7A1.5 1.5 0 0115.5 17h-11A1.5 1.5 0 013 15.5v-7zM7 7V5.5A1.5 1.5 0 018.5 4h3A1.5 1.5 0 0113 5.5V7',
    accent: '#5B21B6',
    accentSoft: '#F1EBFB',
  },
];

const LEVEL_BADGE_CLASS: Record<string, string> = {
  Foundation: 'border-surface-border bg-surface-raised text-ink-muted',
  Professional: 'border-[#2F5FE0]/40 bg-[#EAF1FF] text-[#2F5FE0]',
  Advanced: 'border-[#5B21B6]/40 bg-[#F1EBFB] text-[#5B21B6]',
};

// "Choose a goal / see what's included / learn, practise, review" - a short
// how-it-works strip. Descriptive UX copy, not a claim about specific
// content, so it needs no real data behind it.
const HOW_IT_WORKS = [
  {
    step: '1',
    title: 'Choose a goal',
    body: 'Explore a skill course or a certification exam-prep plan.',
    accent: '#2F5FE0',
  },
  {
    step: '2',
    title: "See what's included",
    body: 'Preview real lessons or questions and compare plans before you buy.',
    accent: '#0F766E',
  },
  {
    step: '3',
    title: 'Learn, practise, review',
    body: 'Resume where you left off and see your progress after every attempt.',
    accent: '#5B21B6',
  },
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

export function LandingPage() {
  const COMPANY = useCompany();
  useCaptureReferral();

  return (
    <div className="min-h-screen bg-surface">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-6">
        <Logo />
        <div className="order-3 w-full sm:order-2 sm:w-auto sm:flex-1">
          <SearchBar to="/search" className="mx-auto max-w-md" />
        </div>
        {/* One "Log in" for everyone - it redirects by role once signed in
            (admin/finance_admin to /admin, otherwise /home), so a separate
            Admin Portal entry is not needed. */}
        <div className="order-2 ml-auto flex items-center gap-2 sm:order-3">
          <Link
            to="/login"
            className="rounded-lg px-4 py-2 text-sm font-medium text-ink-muted hover:text-ink"
          >
            Log in
          </Link>
          <Link
            to="/register"
            className="rounded-lg bg-[#2F5FE0] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1D3FA0]"
          >
            Sign up
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-20 pt-10">
        <div className="flex flex-col items-center gap-12 lg:flex-row lg:items-center lg:text-left">
          <div className="flex-1 text-center lg:text-left">
            <span className="mb-6 inline-block rounded-full border border-[#2F5FE0]/25 bg-[#EAF1FF] px-4 py-1 text-xs font-medium uppercase tracking-wide text-[#2F5FE0]">
              Learning &bull; Certification &bull; Assessment Platform
            </span>
            <h1 className="text-4xl font-bold leading-tight text-ink sm:text-5xl">
              Build skills.
              <br />
              Prove what you know.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-ink-faint lg:mx-0">
              Build and advance your skills, prepare for professional certifications, assess your
              knowledge, or create and sell learning content - all in one platform.
            </p>

            <CertificationGoalSelector />

            <div className="mt-8 flex flex-wrap justify-center gap-2 lg:justify-start">
              {DOMAINS.map((d) => (
                <Link
                  key={d}
                  to={`/search?category=${encodeURIComponent(d)}`}
                  className="rounded-full border border-surface-border bg-surface-raised px-4 py-1.5 text-sm text-ink-muted hover:border-[#2F5FE0]/50"
                >
                  {d}
                </Link>
              ))}
            </div>
          </div>

          {/* Graphic panel illustrating a real feature (resumable practice
              sessions - see EXAM_PREP_FEATURES below) rather than live data,
              so it doesn't need to load or go stale. */}
          <div
            className="hidden w-full max-w-[420px] shrink-0 rounded-3xl p-2 shadow-[0_24px_50px_rgba(30,58,138,0.18)] lg:block"
            style={{ background: 'linear-gradient(135deg, #1E3A8A 0%, #0EA394 100%)' }}
          >
            <div className="rounded-[22px] bg-surface-raised p-7">
              <div className="mb-4 text-base font-bold text-ink">Pick up where you left off</div>
              <div className="mb-2.5 h-2.5 overflow-hidden rounded-full bg-[#EAF1FF]">
                <div className="h-full w-[68%] rounded-full bg-[#2F5FE0]" />
              </div>
              <div className="mb-2.5 h-2.5 w-[82%] rounded-full bg-[#EAF1FF]" />
              <div className="mb-4 h-2.5 w-[55%] rounded-full bg-[#EAF1FF]" />
              <div className="mb-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-[#EAF1FF] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[#2F5FE0]">
                  Practice
                </span>
                <span className="rounded-full bg-[#E6FBF7] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[#0F766E]">
                  Mock exam
                </span>
                <span className="rounded-full bg-[#F1EBFB] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[#5B21B6]">
                  Results
                </span>
              </div>
              <div className="text-xs text-ink-faint">
                Your plan. Your pace. <span className="font-bold text-[#2F5FE0]">Visible progress.</span>
              </div>
            </div>
          </div>
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
                className="flex flex-col rounded-xl border border-surface-border bg-surface-raised p-6 text-left transition hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(15,23,42,0.08)]"
              >
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-lg"
                  style={{ backgroundColor: card.accentSoft, color: card.accent }}
                >
                  <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
                    <path d={card.icon} stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h3 className="mt-4 font-bold text-ink">{card.title}</h3>
                <p className="mt-1 text-sm font-medium" style={{ color: card.accent }}>
                  {card.subtitle}
                </p>
                <p className="mt-3 flex-1 text-sm text-ink-faint">{card.body}</p>
                {card.href.startsWith('#') ? (
                  <a href={card.href} className="mt-4 text-sm font-semibold hover:underline" style={{ color: card.accent }}>
                    {card.cta} &rarr;
                  </a>
                ) : (
                  <Link to={card.href} className="mt-4 text-sm font-semibold hover:underline" style={{ color: card.accent }}>
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
      <section id="learning-paths" className="border-t border-surface-border bg-surface-sunken py-16">
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
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#2F5FE0] px-6 py-3 font-medium text-white transition hover:bg-[#1D3FA0]"
          >
            Explore Exam Preparation
          </Link>
        </div>
      </section>

      {/* How it works - short, descriptive UX copy (not a claim about
          content), so it needs no real data behind it. */}
      <section className="border-t border-surface-border py-16">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {HOW_IT_WORKS.map((item) => (
              <div key={item.step} className="rounded-2xl bg-surface-sunken p-6">
                <div
                  className="mb-4 flex h-8 w-8 items-center justify-center rounded-lg bg-surface text-sm font-extrabold"
                  style={{ color: item.accent }}
                >
                  {item.step}
                </div>
                <h3 className="font-bold text-ink">{item.title}</h3>
                <p className="mt-1.5 text-sm text-ink-faint">{item.body}</p>
              </div>
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
          <Link to="/build-your-own-exam" className="shrink-0 text-sm font-semibold text-[#2F5FE0] hover:underline">
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
    </div>
  );
}
