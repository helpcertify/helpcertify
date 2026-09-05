import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listAvailableQuizzes, listPracticeTestsBucketed } from '../api/studentContentApi';
import { listAvailableCourses } from '../api/courseApi';
import { CourseCoverImage } from '@/components/common/CourseCoverImage';
import { formatMoney } from '@/utils/currency';

// Landed on from the header's search field (StudentShell). Searches quizzes
// (Mock Exams) and practice tests together by title, since the header field
// itself has no idea which of the two a student means. Kept intentionally
// light - a result card here only shows enough to decide whether to open
// the detail page, not the full owned/cart/buy-now branching every other
// listing page has; that logic already lives on QuizDetailPage/
// PracticeTestDetailPage once a card is clicked.
export function SearchResultsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') ?? '';
  const [inputValue, setInputValue] = useState(initialQuery);

  // Re-syncs the input if the URL's ?q= changes from outside this page (the
  // header's own search field submits a fresh query while this page is
  // already mounted, which updates the URL without remounting the
  // component, so useState's initial value alone would go stale).
  useEffect(() => setInputValue(initialQuery), [initialQuery]);

  const { data: quizzes } = useQuery({ queryKey: ['student', 'availableQuizzes'], queryFn: listAvailableQuizzes });
  const { data: practiceBuckets } = useQuery({ queryKey: ['student', 'practiceTests'], queryFn: listPracticeTestsBucketed });
  const { data: courses } = useQuery({ queryKey: ['student', 'availableCourses'], queryFn: listAvailableCourses });

  const term = initialQuery.trim().toLowerCase();
  const matchedQuizzes = term ? (quizzes ?? []).filter((q) => q.title.toLowerCase().includes(term)) : [];
  const matchedTests = term ? (practiceBuckets?.available ?? []).filter((t) => t.title.toLowerCase().includes(term)) : [];
  const matchedCourses = term ? (courses ?? []).filter((c) => c.title.toLowerCase().includes(term)) : [];
  const totalMatches = matchedQuizzes.length + matchedTests.length + matchedCourses.length;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchParams(inputValue.trim() ? { q: inputValue.trim() } : {});
  };

  return (
    <div>
      {/* This page is only ever reached by submitting the header's search
          field, which has no natural "back" affordance of its own. Goes to
          a fixed route (Learning Portal) rather than history back - a
          direct link to /home/search (no prior in-app page) would otherwise
          have nowhere to go back to. */}
      <Link to="/home" className="mb-4 inline-block text-sm text-brand-ink hover:underline">
        ← Back to Learning Portal
      </Link>
      <h1 className="mb-1 text-2xl font-bold text-ink">Search</h1>
      <form onSubmit={handleSubmit} className="mb-6 flex gap-2">
        <div className="relative flex-1">
          <input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Search certifications, exams and topics"
            className="input-dark w-full pr-9"
            autoFocus
          />
          {inputValue && (
            <button
              type="button"
              onClick={() => {
                setInputValue('');
                setSearchParams({});
              }}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
            >
              ✕
            </button>
          )}
        </div>
        <button type="submit" className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          Search
        </button>
      </form>

      {!term ? (
        <p className="rounded-xl border border-dashed border-surface-border p-6 text-center text-sm text-ink-faint">
          Type something above to search Courses, Mock Exams and Practice Exams by title.
        </p>
      ) : totalMatches === 0 ? (
        <p className="rounded-xl border border-dashed border-surface-border p-6 text-center text-sm text-ink-faint">
          No results for "{initialQuery}". Try a different term.
        </p>
      ) : (
        <>
          {matchedCourses.length > 0 && (
            <div className="mb-8">
              <h2 className="mb-3 text-lg font-bold text-ink">Courses</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {matchedCourses.map((c) => (
                  <ResultCard
                    key={c.id}
                    id={c.id}
                    href={`/home/courses/${c.id}`}
                    title={c.title}
                    category={c.category ?? 'Other'}
                    price={c.price ?? 0}
                    currency={c.currency ?? 'INR'}
                  />
                ))}
              </div>
            </div>
          )}
          {matchedQuizzes.length > 0 && (
            <div className="mb-8">
              <h2 className="mb-3 text-lg font-bold text-ink">Mock Exams</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {matchedQuizzes.map((q) => (
                  <ResultCard
                    key={q.id}
                    id={q.id}
                    href={`/home/quizzes/${q.id}`}
                    title={q.title}
                    category={q.category ?? 'Other'}
                    price={q.price ?? 0}
                    currency={q.currency ?? 'INR'}
                  />
                ))}
              </div>
            </div>
          )}
          {matchedTests.length > 0 && (
            <div className="mb-8">
              <h2 className="mb-3 text-lg font-bold text-ink">Practice Exams</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {matchedTests.map((t) => (
                  <ResultCard
                    key={t.id}
                    id={t.id}
                    href={`/home/practice-tests/${t.id}`}
                    title={t.title}
                    category={t.category ?? 'Other'}
                    price={t.price ?? 0}
                    currency={t.currency ?? 'INR'}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ResultCard({
  id,
  href,
  title,
  category,
  price,
  currency,
}: {
  id: string;
  href: string;
  title: string;
  category: string;
  price: number;
  currency: string;
}) {
  return (
    <Link to={href} className="flex h-full flex-col overflow-hidden rounded-xl border border-surface-border bg-surface-raised transition-all duration-150 hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-lg">
      <CourseCoverImage id={id} title={title} className="h-20 w-full" />
      <div className="flex flex-1 flex-col p-3.5">
        <div className="mb-0.5 text-xs uppercase tracking-wide text-ink-faint">{category}</div>
        <h3 className="mb-1 line-clamp-2 text-sm font-bold leading-snug text-ink">{title}</h3>
        <div className="mt-auto text-xs font-semibold text-ink">{price > 0 ? formatMoney(price, currency as 'INR' | 'USD') : 'Free'}</div>
      </div>
    </Link>
  );
}
