// Pure catalog search - a case-insensitive title/name substring match plus
// an optional exact category filter, over already-fetched lists. Used by
// both the public /search page (over getPublicCatalog's data) and the
// signed-in /home/search page. No I/O - co-located test in
// searchCatalog.test.ts, same pattern as studyPlan.ts.

export interface SearchableItem {
  id: string;
  title: string;
  category: string;
}

export interface CatalogGroups<C, Q, P, X> {
  courses: C[];
  quizzes: Q[];
  practiceTests: P[];
  certifications: X[];
}

function matches(item: { title?: string; name?: string; category?: string }, term: string, category: string | null): boolean {
  const haystack = (item.title ?? item.name ?? '').toLowerCase();
  if (term && !haystack.includes(term)) return false;
  if (category && (item.category ?? '') !== category) return false;
  return true;
}

export function filterCatalog<
  C extends { title: string; category: string },
  Q extends { title: string; category: string },
  P extends { title: string; category: string },
  X extends { name: string; provider: string },
>(
  groups: CatalogGroups<C, Q, P, X>,
  rawTerm: string,
  rawCategory?: string | null,
): CatalogGroups<C, Q, P, X> {
  const term = rawTerm.trim().toLowerCase();
  const category = rawCategory?.trim() || null;
  return {
    courses: groups.courses.filter((c) => matches(c, term, category)),
    quizzes: groups.quizzes.filter((q) => matches(q, term, category)),
    practiceTests: groups.practiceTests.filter((p) => matches(p, term, category)),
    // Certifications carry `provider`, not `category` - match the category
    // filter against provider, and the term against the name.
    certifications: groups.certifications.filter(
      (x) => matches({ name: x.name }, term, null) && (!category || x.provider === category),
    ),
  };
}

export function totalResults(groups: CatalogGroups<unknown, unknown, unknown, unknown>): number {
  return groups.courses.length + groups.quizzes.length + groups.practiceTests.length + groups.certifications.length;
}
