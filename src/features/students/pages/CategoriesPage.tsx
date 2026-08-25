import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { listAvailableQuizzes, listPracticeTestsBucketed } from '../api/studentContentApi';
import { formatMoney } from '@/utils/currency';
import { StarRating } from '@/components/common/StarRating';
import type { PurchasableItemType } from '@/types/models';

interface CatalogItem {
  itemType: PurchasableItemType;
  id: string;
  title: string;
  category: string;
  price: number;
  currency: 'INR' | 'USD';
  ratingAvg: number;
  ratingCount: number;
}

export function CategoriesPage() {
  const { data: quizzes } = useQuery({ queryKey: ['student', 'availableQuizzes'], queryFn: listAvailableQuizzes });
  const { data: practiceBuckets } = useQuery({ queryKey: ['student', 'practiceTests'], queryFn: listPracticeTestsBucketed });

  const allItems: CatalogItem[] = [
    ...(quizzes ?? []).map((q) => ({
      itemType: 'quiz' as const,
      id: q.id,
      title: q.title,
      category: q.category ?? 'Other',
      price: q.price ?? 0,
      currency: q.currency ?? 'INR',
      ratingAvg: q.ratingAvg ?? 0,
      ratingCount: q.ratingCount ?? 0,
    })),
    ...(practiceBuckets?.available ?? []).map((t) => ({
      itemType: 'practiceTest' as const,
      id: t.id,
      title: t.title,
      category: t.category ?? 'Other',
      price: t.price ?? 0,
      currency: t.currency ?? 'INR',
      ratingAvg: t.ratingAvg ?? 0,
      ratingCount: t.ratingCount ?? 0,
    })),
  ];

  const categoryCounts = new Map<string, number>();
  for (const item of allItems) categoryCounts.set(item.category, (categoryCounts.get(item.category) ?? 0) + 1);
  const categories = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1]);

  const [selected, setSelected] = useState<string | null>(null);
  const filtered = selected ? allItems.filter((i) => i.category === selected) : allItems;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-ink">Categories</h1>
      <p className="mb-6 text-sm text-ink-faint">Browse quizzes and practice tests by certification body.</p>

      {categories.length === 0 ? (
        <p className="rounded-xl border border-dashed border-surface-border p-6 text-center text-sm text-ink-faint">
          No categorized content is available right now.
        </p>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelected(null)}
              className={`rounded-full border px-3 py-1.5 text-sm ${
                !selected ? 'border-brand-400 bg-brand-500/15 text-brand-ink' : 'border-surface-border text-ink-muted'
              }`}
            >
              All ({allItems.length})
            </button>
            {categories.map(([cat, count]) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelected(cat)}
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  selected === cat ? 'border-brand-400 bg-brand-500/15 text-brand-ink' : 'border-surface-border text-ink-muted'
                }`}
              >
                {cat} ({count})
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((item) => (
              <Link
                key={`${item.itemType}_${item.id}`}
                to={item.itemType === 'quiz' ? `/home/quizzes/${item.id}` : `/home/practice-tests/${item.id}`}
                className="rounded-xl border border-surface-border bg-surface-raised p-4 hover:border-brand-400"
              >
                <div className="mb-1 text-xs uppercase tracking-wide text-ink-faint">
                  {item.category} · {item.itemType === 'quiz' ? 'Exam Quiz' : 'Practice Test'}
                </div>
                <div className="font-medium text-ink">{item.title}</div>
                {item.ratingCount > 0 && (
                  <div className="mt-1 flex items-center gap-1.5">
                    <StarRating value={item.ratingAvg} size="sm" />
                    <span className="text-xs text-ink-faint">
                      {item.ratingAvg.toFixed(1)} ({item.ratingCount})
                    </span>
                  </div>
                )}
                <div className="mt-2 text-sm text-ink-faint">{item.price > 0 ? formatMoney(item.price, item.currency) : 'Free'}</div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
