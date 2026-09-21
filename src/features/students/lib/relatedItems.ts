// Pure "you might also like" ranking for a product detail page (Quiz/
// Course/Practice Test). Given the item the learner is currently looking
// at (the "anchor") and every other purchasable item in the catalog,
// returns the closest real matches - same category always, same skill
// level preferred, then by popularity. Deliberately narrower than
// recommendCourses.ts (home page): this only ever suggests items in the
// *same* category as the anchor, since "related to what you're looking at
// right now" reads as broken if it drifts into unrelated subjects the way
// a broader homepage feed can. No fabricated signals (no "N bought this
// together") - only real catalog fields already shown elsewhere in the
// app. Co-located test in relatedItems.test.ts.

export type RelatedItemType = 'quiz' | 'practiceTest' | 'course';

export interface RelatableItem {
  id: string;
  itemType: RelatedItemType;
  title: string;
  category: string;
  skillLevel: string;
  ratingAvg: number;
  ratingCount: number;
  price: number;
  originalPrice: number | null;
  currency: 'INR' | 'USD';
}

export interface RelatedAnchor {
  id: string;
  itemType: RelatedItemType;
  category: string;
  skillLevel: string;
}

export function pickRelatedItems(anchor: RelatedAnchor, candidates: RelatableItem[], ownedKeys: Set<string>, limit = 8): RelatableItem[] {
  const anchorCategory = anchor.category.trim().toLowerCase();
  const anchorSkill = anchor.skillLevel.trim().toLowerCase();

  return candidates
    .filter((c) => !(c.itemType === anchor.itemType && c.id === anchor.id))
    .filter((c) => !ownedKeys.has(`${c.itemType}_${c.id}`))
    .filter((c) => c.category.trim().toLowerCase() === anchorCategory)
    .map((c) => ({
      item: c,
      skillMatch: c.skillLevel.trim().toLowerCase() === anchorSkill ? 1 : 0,
    }))
    .sort((a, b) => b.skillMatch - a.skillMatch || b.item.ratingCount - a.item.ratingCount || b.item.ratingAvg - a.item.ratingAvg)
    .slice(0, limit)
    .map((x) => x.item);
}
