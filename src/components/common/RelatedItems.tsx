import { useQuery } from '@tanstack/react-query';
import { listAvailableQuizzes, listPracticeTestsBucketed } from '@/features/students/api/studentContentApi';
import { CourseCarousel, type CarouselItem } from './CourseCarousel';
import type { PurchasableItemType } from '@/types/models';

interface RelatedItemsProps {
  // Omit category (and the exclude pair) to show a general assortment —
  // used on the Practice Exams / Mock Exams landing pages, which have no
  // single "current item" to relate to. Passing category + excludeItemType/
  // excludeItemId (a detail page) scopes the results to that item's own
  // category instead.
  category?: string;
  excludeItemType?: PurchasableItemType;
  excludeItemId?: string;
  limit?: number;
}

// "Students also bought" — a 4-up grid at the very bottom of the page,
// below everything else. On a detail page this is same-category items
// other than the one being viewed; on a landing page (no category given)
// it's the catalog's best-rated items overall. Either way this is a
// same-category/best-rated relation, not real purchase-co-occurrence
// analytics (that would need actual order-history correlation, a much
// bigger feature); reuses the exact same cached list queries
// StudentHomePage/PracticeTestsPage already populate, so arriving here
// from a browse page usually costs no extra network round trip.
export function RelatedItems({ category, excludeItemType, excludeItemId, limit = 4 }: RelatedItemsProps) {
  const { data: quizzes } = useQuery({ queryKey: ['student', 'availableQuizzes'], queryFn: listAvailableQuizzes });
  const { data: practiceBuckets } = useQuery({ queryKey: ['student', 'practiceTests'], queryFn: listPracticeTestsBucketed });

  let candidates: CarouselItem[] = [
    ...(quizzes ?? []).map(
      (q): CarouselItem => ({
        itemType: 'quiz',
        id: q.id,
        title: q.title,
        category: q.category ?? 'Other',
        skillLevel: q.skillLevel ?? 'Foundation',
        price: q.price ?? 0,
        originalPrice: q.originalPrice ?? null,
        currency: q.currency ?? 'INR',
        ratingAvg: q.ratingAvg ?? 0,
        ratingCount: q.ratingCount ?? 0,
        totalQuestions: q.totalQuestions ?? 0,
      })
    ),
    ...(practiceBuckets?.available ?? []).map(
      (t): CarouselItem => ({
        itemType: 'practiceTest',
        id: t.id,
        title: t.title,
        category: t.category ?? 'Other',
        skillLevel: t.skillLevel ?? 'Foundation',
        price: t.price ?? 0,
        originalPrice: t.originalPrice ?? null,
        currency: t.currency ?? 'INR',
        ratingAvg: t.ratingAvg ?? 0,
        ratingCount: t.ratingCount ?? 0,
        totalQuestions: t.totalQuestions ?? 0,
      })
    ),
  ];

  if (category) {
    candidates = candidates.filter((i) => i.category === category);
  } else {
    // No single item to relate to — best-rated first instead of catalog order.
    candidates = [...candidates].sort((a, b) => b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount);
  }
  if (excludeItemType && excludeItemId) {
    candidates = candidates.filter((i) => !(i.itemType === excludeItemType && i.id === excludeItemId));
  }

  return <CourseCarousel title="Students also bought" items={candidates.slice(0, limit)} variant="grid" />;
}
