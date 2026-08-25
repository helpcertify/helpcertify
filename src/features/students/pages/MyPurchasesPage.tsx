import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { cartApi } from '../api/cartApi';
import type { PurchasableItemType } from '@/types/models';

interface PurchasedItem {
  itemType: PurchasableItemType;
  id: string;
  title: string;
  category: string;
}

export function MyPurchasesPage() {
  const { data: purchases } = useQuery({ queryKey: ['student', 'purchases'], queryFn: cartApi.listMyPurchases });

  const { data: items, isLoading } = useQuery({
    queryKey: ['student', 'purchasedItems', purchases?.purchases],
    queryFn: async (): Promise<PurchasedItem[]> => {
      const list = purchases?.purchases ?? [];
      const results = await Promise.all(
        list.map(async (p) => {
          const collectionName = p.itemType === 'quiz' ? 'quizzes' : 'practiceTests';
          const snap = await getDoc(doc(db, collectionName, p.itemId));
          if (!snap.exists()) return null; // deleted since purchase — quietly dropped
          const data = snap.data();
          return { itemType: p.itemType, id: p.itemId, title: data.title as string, category: (data.category as string) ?? 'Other' };
        })
      );
      return results.filter((x): x is PurchasedItem => x !== null);
    },
    enabled: !!purchases,
  });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-ink">My Purchases</h1>
      <p className="mb-6 text-sm text-ink-faint">Everything you've bought, yours to use anytime with no expiry.</p>

      {isLoading ? (
        <p className="text-sm text-ink-faint">Loading…</p>
      ) : !items || items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-surface-border p-8 text-center">
          <p className="mb-4 text-ink-faint">You haven't purchased anything yet.</p>
          <div className="flex justify-center gap-3">
            <Link to="/home" className="rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted hover:border-brand-400">
              Browse Quiz Library
            </Link>
            <Link
              to="/home/practice-tests"
              className="rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted hover:border-brand-400"
            >
              Browse Practice Exams
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Link
              key={`${item.itemType}_${item.id}`}
              to={item.itemType === 'quiz' ? `/home/quizzes/${item.id}` : `/home/practice-tests/${item.id}`}
              className="rounded-xl border border-surface-border bg-surface-raised p-4 hover:border-brand-400"
            >
              <div className="mb-1 text-xs uppercase tracking-wide text-ink-faint">
                {item.category} · {item.itemType === 'quiz' ? 'Exam Quiz' : 'Practice Test'}
              </div>
              <div className="line-clamp-2 font-medium leading-snug text-ink">{item.title}</div>
              <div className="mt-2 text-sm text-brand-ink">Go start it →</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
