import { useQuery } from '@tanstack/react-query';
import { listAvailableQuizzes, listPracticeTestsBucketed } from '@/features/students/api/studentContentApi';
import { cartApi } from '@/features/students/api/cartApi';
import { CourseCarousel, type CarouselItem } from './CourseCarousel';
import type { PurchasableItemType } from '@/types/models';

interface RelatedItemsProps {
  category: string;
  excludeItemType: PurchasableItemType;
  excludeItemId: string;
}

// "Students also bought" on a detail page — other items in the same
// category, capped at 8. This is a same-category relation, not real
// purchase-co-occurrence analytics (that would need actual order-history
// correlation, a much bigger feature); reuses the exact same cached list
// queries StudentHomePage/PracticeTestsPage already populate, so arriving
// here from a browse page usually costs no extra network round trip.
export function RelatedItems({ category, excludeItemType, excludeItemId }: RelatedItemsProps) {
  const { data: quizzes } = useQuery({ queryKey: ['student', 'availableQuizzes'], queryFn: listAvailableQuizzes });
  const { data: practiceBuckets } = useQuery({ queryKey: ['student', 'practiceTests'], queryFn: listPracticeTestsBucketed });
  const { data: purchases } = useQuery({ queryKey: ['student', 'purchases'], queryFn: cartApi.listMyPurchases });
  const purchasedSet = new Set((purchases?.purchases ?? []).map((p) => `${p.itemType}_${p.itemId}`));

  const candidates: CarouselItem[] = [
    ...(quizzes ?? [])
      .filter((q) => (q.category ?? 'Other') === category)
      .map(
        (q): CarouselItem => ({
          itemType: 'quiz',
          id: q.id,
          title: q.title,
          category: q.category ?? 'Other',
          skillLevel: q.skillLevel ?? 'Foundation',
          description: q.description ?? '',
          statsLabel: `${q.totalQuestions} questions · ${q.durationMinutes} min`,
          price: q.price ?? 0,
          originalPrice: q.originalPrice ?? null,
          currency: q.currency ?? 'INR',
          ratingAvg: q.ratingAvg ?? 0,
          ratingCount: q.ratingCount ?? 0,
          owned: (q.price ?? 0) === 0 || purchasedSet.has(`quiz_${q.id}`),
        })
      ),
    ...(practiceBuckets?.available ?? [])
      .filter((t) => (t.category ?? 'Other') === category)
      .map(
        (t): CarouselItem => ({
          itemType: 'practiceTest',
          id: t.id,
          title: t.title,
          category: t.category ?? 'Other',
          skillLevel: t.skillLevel ?? 'Foundation',
          description: t.description ?? '',
          statsLabel: `${t.totalQuestions} questions · ${t.durationPerSessionMinutes} min/session`,
          price: t.price ?? 0,
          originalPrice: t.originalPrice ?? null,
          currency: t.currency ?? 'INR',
          ratingAvg: t.ratingAvg ?? 0,
          ratingCount: t.ratingCount ?? 0,
          owned: (t.price ?? 0) === 0 || purchasedSet.has(`practiceTest_${t.id}`),
        })
      ),
  ].filter((i) => !(i.itemType === excludeItemType && i.id === excludeItemId));

  return <CourseCarousel title="Students also bought" items={candidates.slice(0, 8)} />;
}
