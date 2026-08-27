import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { cartApi } from '../api/cartApi';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { toDate } from '@/utils/formatDate';
import { formatMoney } from '@/utils/currency';
import { CourseCoverImage } from '@/components/common/CourseCoverImage';
import { StarRating } from '@/components/common/StarRating';
import type { PurchasableItemType } from '@/types/models';

interface PurchasedItem {
  itemType: PurchasableItemType;
  id: string;
  title: string;
  category: string;
  skillLevel: string;
  totalQuestions: number;
  // Quiz-only.
  durationMinutes: number | undefined;
  // Practice-test-only; null means the student picks a length per session.
  durationPerSessionMinutes: number | null | undefined;
  ratingAvg: number;
  ratingCount: number;
  price: number;
  currency: 'INR' | 'USD';
  purchasedAt: unknown;
  answered: number;
}

// Billing & Orders — every purchase as a full product card (cover, rating,
// stats, price, progress), not just a bare title + link, so this reads as
// an actual order history instead of a plain list.
export function MyPurchasesPage() {
  const uid = useAuthStore((s) => s.firebaseUser?.uid);
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

          // Unique-answered progress, same source each item's own detail
          // page already uses — a free item still counts as "owned" here
          // (this whole page is scoped to what a purchase record exists
          // for, so a free item never appears regardless).
          let answered = 0;
          if (p.itemType === 'quiz') {
            const attemptSnap = await getDocs(
              query(collection(db, 'quizAttempts'), where('userId', '==', uid), where('quizId', '==', p.itemId))
            );
            answered = attemptSnap.docs[0]?.data().answeredCount as number | undefined ?? 0;
          } else {
            const progressSnap = await getDoc(doc(db, 'practiceProgress', `${uid}_${p.itemId}`));
            answered = progressSnap.exists() ? ((progressSnap.data().answeredQuestionIds as string[]) ?? []).length : 0;
          }

          return {
            itemType: p.itemType,
            id: p.itemId,
            title: data.title as string,
            category: (data.category as string) ?? 'Other',
            skillLevel: (data.skillLevel as string) ?? 'Foundation',
            totalQuestions: (data.totalQuestions as number) ?? 0,
            durationMinutes: data.durationMinutes as number | undefined,
            durationPerSessionMinutes: data.durationPerSessionMinutes as number | null | undefined,
            ratingAvg: (data.ratingAvg as number) ?? 0,
            ratingCount: (data.ratingCount as number) ?? 0,
            price: (data.price as number) ?? 0,
            currency: (data.currency as 'INR' | 'USD') ?? 'INR',
            purchasedAt: p.purchasedAt,
            answered,
          };
        })
      );
      return results.filter((x): x is PurchasedItem => x !== null);
    },
    enabled: !!purchases && !!uid,
  });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-ink">Billing & Orders</h1>
      <p className="mb-6 text-sm text-ink-faint">Everything you've bought, yours to use anytime with no expiry.</p>

      {isLoading ? (
        <p className="text-sm text-ink-faint">Loading…</p>
      ) : !items || items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-surface-border p-8 text-center">
          <p className="mb-4 text-ink-faint">You haven't purchased anything yet.</p>
          <div className="flex justify-center gap-3">
            <Link to="/home/mock-exams" className="rounded-lg bg-[#155EEF] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#004EEB]">
              Browse Mock Exams
            </Link>
            <Link
              to="/home/practice-tests"
              className="rounded-lg bg-[#155EEF] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#004EEB]"
            >
              Browse Practice Exams
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const detailHref = item.itemType === 'quiz' ? `/home/quizzes/${item.id}` : `/home/practice-tests/${item.id}`;
            const done = item.totalQuestions > 0 && item.answered >= item.totalQuestions;
            return (
              <div
                key={`${item.itemType}_${item.id}`}
                className="flex h-full flex-col overflow-hidden rounded-[14px] border border-[#DCE7FF] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.06)] transition-all duration-150 hover:-translate-y-[3px] hover:border-[#B9CEFF] hover:shadow-[0_8px_20px_rgba(21,94,239,0.12)]"
              >
                <Link to={detailHref}>
                  <CourseCoverImage id={item.id} title={item.title} className="h-24 w-full" />
                </Link>
                <div className="flex flex-1 flex-col p-3.5">
                  <div className="mb-0.5 flex flex-wrap items-center gap-1.5 text-xs uppercase tracking-wide text-[#64748B]">
                    <span>{item.category}</span>
                    <span>·</span>
                    <span>{item.skillLevel}</span>
                    <span>·</span>
                    <span>{item.itemType === 'quiz' ? 'Exam Quiz' : 'Practice Test'}</span>
                  </div>
                  <Link to={detailHref} className="hover:text-[#155EEF]">
                    <h3 className="mb-1 line-clamp-2 text-sm font-bold leading-snug text-[#0F172A]">{item.title}</h3>
                  </Link>
                  {item.ratingCount > 0 && (
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <StarRating value={item.ratingAvg} size="sm" />
                      <span className="text-xs text-[#64748B]">
                        {item.ratingAvg.toFixed(1)} ({item.ratingCount})
                      </span>
                    </div>
                  )}
                  <div className="mb-1.5 text-xs text-[#64748B]">
                    📄 {item.totalQuestions} questions ·{' '}
                    {item.itemType === 'quiz'
                      ? `${item.durationMinutes} min`
                      : item.durationPerSessionMinutes
                        ? `${item.durationPerSessionMinutes} min/session`
                        : 'you choose session length'}
                  </div>
                  <div className="mb-2 text-xs text-[#64748B]">
                    {item.answered}/{item.totalQuestions} answered
                    {done && ' · Completed'}
                  </div>
                  <div className="mb-3 text-xs text-[#64748B]">
                    Purchased {toDate(item.purchasedAt).toLocaleDateString()} · Value{' '}
                    {item.price > 0 ? formatMoney(item.price, item.currency) : 'Free'}
                  </div>

                  <Link
                    to={detailHref}
                    className="mt-auto block rounded-lg bg-[#155EEF] py-1.5 text-center text-sm font-semibold text-white transition-colors hover:bg-[#004EEB]"
                  >
                    Go start it →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
