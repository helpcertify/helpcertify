import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { listAvailableQuizzes, listPracticeTestsBucketed } from '@/features/students/api/studentContentApi';
import { CourseCoverImage } from './CourseCoverImage';
import { formatMoney } from '@/utils/currency';
import type { PurchasableItemType } from '@/types/models';

interface RelatedItem {
  itemType: PurchasableItemType;
  id: string;
  title: string;
  price: number;
  currency: 'INR' | 'USD';
}

interface RelatedItemsProps {
  category: string;
  excludeItemType: PurchasableItemType;
  excludeItemId: string;
}

// "Students also bought" on a detail page — other items in the same
// category, capped at 4. This is a same-category relation, not real
// purchase-co-occurrence analytics (that would need actual order-history
// correlation, a much bigger feature); reuses the exact same cached list
// queries StudentHomePage/PracticeTestsPage already populate, so arriving
// here from a browse page usually costs no extra network round trip.
export function RelatedItems({ category, excludeItemType, excludeItemId }: RelatedItemsProps) {
  const { data: quizzes } = useQuery({ queryKey: ['student', 'availableQuizzes'], queryFn: listAvailableQuizzes });
  const { data: practiceBuckets } = useQuery({ queryKey: ['student', 'practiceTests'], queryFn: listPracticeTestsBucketed });

  const candidates: RelatedItem[] = [
    ...(quizzes ?? [])
      .filter((q) => (q.category ?? 'Other') === category)
      .map((q) => ({ itemType: 'quiz' as const, id: q.id, title: q.title, price: q.price ?? 0, currency: q.currency ?? 'INR' })),
    ...(practiceBuckets?.available ?? [])
      .filter((t) => (t.category ?? 'Other') === category)
      .map((t) => ({ itemType: 'practiceTest' as const, id: t.id, title: t.title, price: t.price ?? 0, currency: t.currency ?? 'INR' })),
  ].filter((i) => !(i.itemType === excludeItemType && i.id === excludeItemId));

  const related = candidates.slice(0, 4);
  if (related.length === 0) return null;

  return (
    <div className="mt-8">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-faint">Students also bought</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {related.map((item) => (
          <Link
            key={`${item.itemType}_${item.id}`}
            to={item.itemType === 'quiz' ? `/home/quizzes/${item.id}` : `/home/practice-tests/${item.id}`}
            className="overflow-hidden rounded-xl border border-surface-border bg-surface-raised hover:border-brand-400"
          >
            <CourseCoverImage id={item.id} title={item.title} className="h-20 w-full" />
            <div className="p-3">
              <div className="mb-1 truncate text-sm font-medium text-ink">{item.title}</div>
              <div className="text-xs text-ink-faint">{item.price > 0 ? formatMoney(item.price, item.currency) : 'Free'}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
