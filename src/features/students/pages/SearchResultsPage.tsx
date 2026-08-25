import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listAvailableQuizzes, listPracticeTestsBucketed } from '../api/studentContentApi';
import { CourseCoverImage } from '@/components/common/CourseCoverImage';
import { formatMoney } from '@/utils/currency';

// Landed on from the header's search field (StudentShell). Searches quizzes
// (Mock Exams) and practice tests together by title, since the header field
// itself has no idea which of the two a student means. Kept intentionally
// light — a result card here only shows enough to decide whether to open
// the detail page, not the full owned/cart/buy-now branching every other
// listing page has; that logic already lives on QuizDetailPage/
// PracticeTestDetailPage once a card is clicked.
export function SearchResultsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') ?? '';
  const [inputValue, setInputValue] = useState(initialQuery);

  const { data: quizzes } = useQuery({ queryKey: ['student', 'availableQuizzes'], queryFn: listAvailableQuizzes });
  const { data: practiceBuckets } = useQuery({ queryKey: ['student', 'practiceTests'], queryFn: listPracticeTestsBucketed });

  const term = initialQuery.trim().toLowerCase();
  const matchedQuizzes = term ? (quizzes ?? []).filter((q) => q.title.toLowerCase().includes(term)) : [];
  const matchedTests = term ? (practiceBuckets?.available ?? []).filter((t) => t.title.toLowerCase().includes(term)) : [];
  const totalMatches = matchedQuizzes.length + matchedTests.length;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchParams(inputValue.trim() ? { q: inputValue.trim() } : {});
  };

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-ink">Search</h1>
      <form onSubmit={handleSubmit} className="mb-6 flex gap-2">
        <input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Search certifications, exams and topics"
          className="input-dark flex-1"
          autoFocus
        />
        <button type="submit" className="rounded-lg bg-[#1D4ED8] px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          Search
        </button>
      </form>

      {!term ? (
        <p className="rounded-xl border border-dashed border-surface-border p-6 text-center text-sm text-ink-faint">
          Type something above to search Mock Exams and Practice Exams by title.
        </p>
      ) : totalMatches === 0 ? (
        <p className="rounded-xl border border-dashed border-surface-border p-6 text-center text-sm text-ink-faint">
          No results for "{initialQuery}". Try a different term.
        </p>
      ) : (
        <>
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
    <Link to={href} className="overflow-hidden rounded-xl border border-surface-border bg-surface-raised hover:border-brand-400">
      <CourseCoverImage id={id} title={title} className="h-20 w-full" />
      <div className="p-3.5">
        <div className="mb-0.5 text-xs uppercase tracking-wide text-ink-faint">{category}</div>
        <h3 className="mb-1 line-clamp-2 text-sm font-bold leading-snug text-ink">{title}</h3>
        <div className="text-xs font-semibold text-ink">{price > 0 ? formatMoney(price, currency as 'INR' | 'USD') : 'Free'}</div>
      </div>
    </Link>
  );
}
