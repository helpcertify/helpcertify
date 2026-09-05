import { useQuery } from '@tanstack/react-query';
import { listAvailableCourses } from '../api/courseApi';
import { cartApi } from '../api/cartApi';
import { activePurchaseKeys } from '../lib/purchaseAccess';
import { recommendCourses } from '../lib/recommendCourses';
import { CourseRow, type CourseRowItem } from '@/components/common/CourseRow';

// "Recommended courses" on the home page. Categories the learner is
// already active in come from the courses they own; recommendCourses then
// ranks the rest of the published catalog by category match and
// popularity. Hidden entirely when there is nothing to suggest.
export function RecommendedCourses() {
  const { data: courses } = useQuery({ queryKey: ['student', 'availableCourses'], queryFn: listAvailableCourses });
  const { data: purchases } = useQuery({ queryKey: ['student', 'purchases'], queryFn: cartApi.listMyPurchases });

  const purchasedSet = activePurchaseKeys(purchases?.purchases);
  const all = courses ?? [];
  const ownedIds = new Set(all.filter((c) => purchasedSet.has(`course_${c.id}`)).map((c) => c.id));
  const activeCategories = all.filter((c) => ownedIds.has(c.id)).map((c) => c.category);

  const ranked = recommendCourses(
    activeCategories,
    all.map((c) => ({
      id: c.id,
      title: c.title,
      category: c.category,
      skillLevel: c.skillLevel,
      ratingAvg: c.ratingAvg,
      ratingCount: c.ratingCount,
    })),
    ownedIds,
    undefined,
    8,
  );

  const byId = new Map(all.map((c) => [c.id, c]));
  const items: CourseRowItem[] = ranked.map((r) => {
    const c = byId.get(r.id)!;
    return {
      id: c.id,
      title: c.title,
      category: c.category,
      skillLevel: c.skillLevel,
      price: c.price,
      originalPrice: c.originalPrice,
      currency: c.currency,
      ratingAvg: c.ratingAvg,
      ratingCount: c.ratingCount,
      coverImageUrl: c.coverImageUrl,
    };
  });

  if (items.length === 0) return null;

  const heading = activeCategories.length > 0 ? `Because you're learning ${activeCategories[0]}` : 'Courses to explore';

  return <CourseRow title={heading} items={items} seeAllHref="/home/courses" compact />;
}
