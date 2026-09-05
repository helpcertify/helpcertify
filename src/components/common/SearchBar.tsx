import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SearchIcon } from './icons';

interface SearchBarProps {
  // Target results route, e.g. "/search" (public) or "/home/search" (signed
  // in). The typed term is appended as ?q=.
  to: string;
  placeholder?: string;
  // "pill" (rounded, for a nav/hero) or "block" (square-ish, for a page).
  variant?: 'pill' | 'block';
  className?: string;
  initialValue?: string;
}

// One search field used on the landing page (nav + hero) and in the
// signed-in shell header, replacing the two hand-rolled <form>s that
// existed before. Submitting navigates to `${to}?q=<term>`.
export function SearchBar({ to, placeholder = 'Search courses, practice tests, certifications', variant = 'pill', className = '', initialValue = '' }: SearchBarProps) {
  const navigate = useNavigate();
  const [value, setValue] = useState(initialValue);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const term = value.trim();
    navigate(term ? `${to}?q=${encodeURIComponent(term)}` : to);
  };

  const radius = variant === 'pill' ? 'rounded-full' : 'rounded-lg';

  return (
    <form onSubmit={submit} className={className} role="search">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className={`input-dark w-full ${radius} pl-9 pr-9`}
        />
        {value && (
          <button
            type="button"
            onClick={() => setValue('')}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
          >
            &#10005;
          </button>
        )}
      </div>
    </form>
  );
}
