import { computeRatingBreakdown } from './ratingBreakdown';

// A 5-to-1-star bar breakdown next to a rating average - the familiar
// Amazon/Udemy pattern that shows a shopper *how* a rating was earned
// (mostly 5s vs. a bimodal split), not just the single averaged number.
// Built entirely from the same review list already rendered below it.
export function RatingBreakdown({ reviews }: { reviews: { rating: number }[] }) {
  if (reviews.length === 0) return null;
  const rows = computeRatingBreakdown(reviews);

  return (
    <div className="mb-5 flex flex-col gap-1">
      {rows.map((row) => (
        <div key={row.star} className="flex items-center gap-2 text-xs text-ink-faint">
          <span className="w-9 shrink-0 text-right">
            {row.star} star{row.star === 1 ? '' : 's'}
          </span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
            <div className="h-full rounded-full bg-warning" style={{ width: `${row.pct}%` }} />
          </div>
          <span className="w-8 shrink-0 tabular-nums">{row.count}</span>
        </div>
      ))}
    </div>
  );
}
