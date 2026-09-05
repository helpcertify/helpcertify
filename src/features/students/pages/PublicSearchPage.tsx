import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import logoLockup from '@/assets/logo-lockup.png';
import { SearchBar } from '@/components/common/SearchBar';
import { CourseCoverImage } from '@/components/common/CourseCoverImage';
import { formatMoney } from '@/utils/currency';
import { filterCatalog, totalResults } from '../lib/searchCatalog';
import { getPublicCatalog } from '@/features/landing/api/publicCatalogApi';

// The logged-out catalog search, reached at /search (outside
// ProtectedRoute). Reads the one unauthenticated catalog endpoint
// (getPublicCatalog) and filters it client-side with the same pure
// filterCatalog helper the signed-in /home/search uses. Cards link to the
// public-facing sign-in flow: a logged-out visitor has to register before
// opening a detail page, so every card routes through /register with a
// ?next= back to where they were headed.
export function PublicSearchPage() {
  const [params] = useSearchParams();
  const term = params.get('q') ?? '';
  const category = params.get('category') ?? '';

  const { data, isLoading, isError } = useQuery({
    queryKey: ['publicCatalog'],
    queryFn: getPublicCatalog,
    staleTime: 5 * 60 * 1000,
  });

  const results = useMemo(() => {
    if (!data) return null;
    return filterCatalog(
      {
        courses: data.courses,
        quizzes: data.quizzes,
        practiceTests: data.practiceTests,
        certifications: data.certifications,
      },
      term,
      category,
    );
  }, [data, term, category]);

  const count = results ? totalResults(results) : 0;
  const heading = term
    ? `Results for "${term}"`
    : category
      ? `${category} courses, exams and certifications`
      : 'Browse the HelpCertify catalog';

  return (
    <div className="min-h-screen bg-surface text-ink">
      <header className="border-b border-surface-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-4">
          <Link to="/" aria-label="HelpCertify home" className="flex items-center">
            <img src={logoLockup} alt="HelpCertify" className="h-8 w-auto object-contain" width={175} height={80} />
          </Link>
          <div className="order-3 w-full sm:order-2 sm:w-auto sm:flex-1">
            <SearchBar to="/search" initialValue={term} className="mx-auto max-w-xl" />
          </div>
          <div className="order-2 ml-auto flex items-center gap-3 text-sm sm:order-3">
            <Link to="/login" className="font-medium text-ink-muted hover:text-ink">
              Log in
            </Link>
            <Link to="/register" className="rounded-lg bg-brand-500 px-3 py-1.5 font-semibold text-white hover:bg-brand-600">
              Sign up
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="mb-1 text-2xl font-bold text-ink">{heading}</h1>
        <p className="mb-8 text-sm text-ink-faint">
          {isLoading ? 'Loading catalog...' : `${count} result${count === 1 ? '' : 's'}`}
        </p>

        {isError && (
          <p className="rounded-xl border border-dashed border-surface-border p-6 text-center text-sm text-ink-faint">
            We could not load the catalog just now. Please try again in a moment.
          </p>
        )}

        {results && count === 0 && !isLoading && (
          <p className="rounded-xl border border-dashed border-surface-border p-6 text-center text-sm text-ink-faint">
            Nothing matched. Try a broader term, or{' '}
            <Link to="/register" className="font-semibold text-brand-ink hover:underline">
              create an account
            </Link>{' '}
            to see everything.
          </p>
        )}

        {results && (
          <div className="space-y-10">
            <ResultSection
              heading="Courses"
              items={results.courses.map((c) => ({
                id: c.id,
                title: c.title,
                category: c.category,
                price: c.price,
                currency: c.currency,
              }))}
            />
            <ResultSection
              heading="Certifications"
              items={results.certifications.map((x) => ({
                id: x.id,
                title: x.name,
                category: x.provider,
                price: x.fromPriceMinor,
                currency: x.currency,
              }))}
            />
            <ResultSection
              heading="Mock Exams"
              items={results.quizzes.map((q) => ({
                id: q.id,
                title: q.title,
                category: q.category,
                price: q.price,
                currency: q.currency,
              }))}
            />
            <ResultSection
              heading="Practice Exams"
              items={results.practiceTests.map((p) => ({
                id: p.id,
                title: p.title,
                category: p.category,
                price: p.price,
                currency: p.currency,
              }))}
            />
          </div>
        )}
      </main>
    </div>
  );
}

interface Card {
  id: string;
  title: string;
  category: string;
  price: number;
  currency: 'INR' | 'USD';
}

function ResultSection({ heading, items }: { heading: string; items: Card[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 text-lg font-bold text-ink">{heading}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {items.map((c) => (
          <Link
            key={c.id}
            to="/register"
            className="flex h-full flex-col overflow-hidden rounded-xl border border-surface-border bg-surface-raised transition-all duration-150 hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-lg"
          >
            <CourseCoverImage id={c.id} title={c.title} className="h-20 w-full" />
            <div className="flex flex-1 flex-col p-3.5">
              <div className="mb-0.5 text-xs uppercase tracking-wide text-ink-faint">{c.category}</div>
              <h3 className="mb-1 line-clamp-2 text-sm font-bold leading-snug text-ink">{c.title}</h3>
              <div className="mt-auto text-xs font-semibold text-ink">
                {c.price > 0 ? formatMoney(c.price, c.currency) : 'Free'}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
