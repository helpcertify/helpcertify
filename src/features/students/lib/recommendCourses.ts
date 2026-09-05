// Pure course recommendation for the home page. Given the categories the
// learner is already active in (derived from owned purchases, study plans
// and in-progress items), the full published course list, and the set of
// courses they already own, return the top N courses to suggest - ranked
// by category match, then skill-level proximity, then popularity. No I/O -
// co-located test in recommendCourses.test.ts.

export interface RecommendableCourse {
  id: string;
  title: string;
  category: string;
  skillLevel: string;
  ratingAvg: number;
  ratingCount: number;
}

const SKILL_ORDER: Record<string, number> = {
  beginner: 0,
  foundation: 0,
  intermediate: 1,
  professional: 1,
  advanced: 2,
  expert: 2,
};

function skillRank(level: string): number {
  return SKILL_ORDER[level.trim().toLowerCase()] ?? 1;
}

export function recommendCourses(
  activeCategories: string[],
  courses: RecommendableCourse[],
  ownedCourseIds: Set<string>,
  preferredSkillLevel?: string,
  limit = 8,
): RecommendableCourse[] {
  const active = new Set(activeCategories.map((c) => c.trim().toLowerCase()));
  const target = preferredSkillLevel ? skillRank(preferredSkillLevel) : null;

  return courses
    .filter((c) => !ownedCourseIds.has(c.id))
    .map((c) => {
      const categoryMatch = active.has(c.category.trim().toLowerCase()) ? 1 : 0;
      const skillDistance = target === null ? 0 : Math.abs(skillRank(c.skillLevel) - target);
      return { course: c, categoryMatch, skillDistance };
    })
    .sort(
      (a, b) =>
        b.categoryMatch - a.categoryMatch ||
        a.skillDistance - b.skillDistance ||
        b.course.ratingCount - a.course.ratingCount ||
        b.course.ratingAvg - a.course.ratingAvg,
    )
    .slice(0, limit)
    .map((x) => x.course);
}
