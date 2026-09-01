import { CERTIFICATION_CATEGORIES, SKILL_LEVELS } from '@/types/models';
import type { CertificationCategory, SkillLevel } from '@/types/models';

export type PriceFilter = 'all' | 'free' | 'paid';
export type StatusFilter = 'all' | 'not_started' | 'in_progress' | 'completed';

export interface ExamFilters {
  search: string;
  category: CertificationCategory | 'all';
  skillLevel: SkillLevel | 'all';
  price: PriceFilter;
  status: StatusFilter;
}

export const DEFAULT_EXAM_FILTERS: ExamFilters = {
  search: '',
  category: 'all',
  skillLevel: 'all',
  price: 'all',
  status: 'all',
};

interface ExamFilterBarProps {
  filters: ExamFilters;
  onChange: (next: ExamFilters) => void;
  // Some pages (e.g. a detail-less list) have no concept of started/
  // in-progress/completed - hide the status dropdown there rather than
  // show a filter that can never do anything.
  showStatus?: boolean;
}

// Shared filter bar for Practice Exams and Mock Exams - replaces the old
// standalone Categories tab; its provider/level filtering moved inline here
// instead, plus price and progress-status filters and a search box. There's
// no separate "Certification" field in the data model distinct from
// category (vendor) + title (e.g. "CISM" only exists as part of a quiz's
// title, not its own structured field), so a specific-certification search
// is handled by the search box rather than a dedicated dropdown.
export function ExamFilterBar({ filters, onChange, showStatus = true }: ExamFilterBarProps) {
  const set = <K extends keyof ExamFilters>(key: K, value: ExamFilters[K]) => onChange({ ...filters, [key]: value });

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      <input
        value={filters.search}
        onChange={(e) => set('search', e.target.value)}
        placeholder="Search by title…"
        aria-label="Search"
        className="input-dark w-full sm:w-56"
      />
      <select
        value={filters.category}
        onChange={(e) => set('category', e.target.value as ExamFilters['category'])}
        aria-label="Provider"
        className="input-dark w-auto"
      >
        <option value="all">All providers</option>
        {CERTIFICATION_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <select
        value={filters.skillLevel}
        onChange={(e) => set('skillLevel', e.target.value as ExamFilters['skillLevel'])}
        aria-label="Difficulty"
        className="input-dark w-auto"
      >
        <option value="all">All levels</option>
        {SKILL_LEVELS.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>
      <select
        value={filters.price}
        onChange={(e) => set('price', e.target.value as PriceFilter)}
        aria-label="Price"
        className="input-dark w-auto"
      >
        <option value="all">Free & paid</option>
        <option value="free">Free only</option>
        <option value="paid">Purchased/Paid only</option>
      </select>
      {showStatus && (
        <select
          value={filters.status}
          onChange={(e) => set('status', e.target.value as StatusFilter)}
          aria-label="Status"
          className="input-dark w-auto"
        >
          <option value="all">Any status</option>
          <option value="not_started">Not started</option>
          <option value="in_progress">In progress</option>
          <option value="completed">Completed</option>
        </select>
      )}
    </div>
  );
}

// The actual predicate - kept separate from the bar itself so each page's
// own item shape (quiz vs practice test have different field names for
// "how far along am I") can compute its own `status` however makes sense,
// then run every other filter through this one shared function.
export function matchesExamFilters(
  filters: ExamFilters,
  item: { title: string; category: string; skillLevel: string; price: number },
  status: 'not_started' | 'in_progress' | 'completed'
): boolean {
  if (filters.search.trim() && !item.title.toLowerCase().includes(filters.search.trim().toLowerCase())) return false;
  if (filters.category !== 'all' && item.category !== filters.category) return false;
  if (filters.skillLevel !== 'all' && item.skillLevel !== filters.skillLevel) return false;
  if (filters.price === 'free' && item.price > 0) return false;
  if (filters.price === 'paid' && item.price === 0) return false;
  if (filters.status !== 'all' && filters.status !== status) return false;
  return true;
}
