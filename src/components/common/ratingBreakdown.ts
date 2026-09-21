// Pure aggregation from a list of real reviews into a 5-to-1-star
// breakdown (count + percentage per star), for RatingBreakdown.tsx.
// Computed client-side straight from the actual review list a page
// already has loaded, rather than trusting a separately-denormalized
// count - so it can never drift from what's actually on screen below it.

export interface RatingBreakdownRow {
  star: number;
  count: number;
  pct: number;
}

export function computeRatingBreakdown(reviews: { rating: number }[]): RatingBreakdownRow[] {
  const total = reviews.length;
  const counts = [0, 0, 0, 0, 0]; // index 0 = 1 star ... index 4 = 5 star
  for (const r of reviews) {
    const star = Math.round(r.rating);
    if (star >= 1 && star <= 5) counts[star - 1]++;
  }
  return [5, 4, 3, 2, 1].map((star) => {
    const count = counts[star - 1];
    return { star, count, pct: total > 0 ? Math.round((count / total) * 100) : 0 };
  });
}
