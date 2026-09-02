import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { cartApi } from '../api/cartApi';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { toDate } from '@/utils/formatDate';
import { ProductCardShell } from '@/components/common/ProductCardShell';

interface PurchasedItem {
  // A purchase doc is never itemType 'package' - buying a package fans out
  // to one purchase doc per included quiz/practiceTest instead (see
  // PackageDoc's own comment in src/types/models.ts), so this page only
  // ever deals with the two flat item types.
  itemType: 'quiz' | 'practiceTest';
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
  // Set for package-sourced purchases with a validity window. null = lifetime.
  expiresAt: unknown;
  answered: number;
}

// Billing & Orders - every purchase as a full product card (cover, rating,
// stats, price, progress), not just a bare title + link, so this reads as
// an actual order history instead of a plain list.
export function MyPurchasesPage() {
  const uid = useAuthStore((s) => s.firebaseUser?.uid);
  const { data: purchases } = useQuery({ queryKey: ['student', 'purchases'], queryFn: cartApi.listMyPurchases });

  const { data: items, isLoading } = useQuery({
    queryKey: ['student', 'purchasedItems', purchases?.purchases],
    queryFn: async (): Promise<PurchasedItem[]> => {
      // Defensive filter, not just a type narrowing - a purchase doc should
      // never be itemType 'package', but this guards against ever silently
      // mis-rendering one as a practice test if that ever changed.
      const list = (purchases?.purchases ?? []).filter(
        (p): p is typeof p & { itemType: 'quiz' | 'practiceTest' } => p.itemType === 'quiz' || p.itemType === 'practiceTest'
      );
      const results = await Promise.all(
        list.map(async (p) => {
          const collectionName = p.itemType === 'quiz' ? 'quizzes' : 'practiceTests';
          const snap = await getDoc(doc(db, collectionName, p.itemId));
          if (!snap.exists()) return null; // deleted since purchase - quietly dropped
          const data = snap.data();

          // Unique-answered progress, same source each item's own detail
          // page already uses - a free item still counts as "owned" here
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
            expiresAt: (p.expiresAt ?? null) as unknown,
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
        // Same ProductCardShell as every other browsable-item grid (Home,
        // Practice Exams, Mock Exams, Saved Items) - same size, same
        // gradient header, icon, and Click here link - with the purchase-
        // specific facts (duration, answered progress, purchase date/value)
        // riding in the shell's optional `extra` slot below the price.
        <div className="flex flex-wrap gap-4">
          {items.map((item) => {
            const detailHref = item.itemType === 'quiz' ? `/home/quizzes/${item.id}` : `/home/practice-tests/${item.id}`;
            const done = item.totalQuestions > 0 && item.answered >= item.totalQuestions;
            const expired = !!item.expiresAt && toDate(item.expiresAt).getTime() < Date.now();
            const extra = (
              <div className="mb-3 space-y-1 text-xs text-[#64748B]">
                {item.expiresAt != null &&
                  (expired ? (
                    <div className="font-semibold text-[#C2410C]">
                      Expired on {toDate(item.expiresAt).toLocaleDateString()} · buy the package again to renew
                    </div>
                  ) : (
                    <div>Access until {toDate(item.expiresAt).toLocaleDateString()}</div>
                  ))}
                <div>
                  📄 {item.totalQuestions} questions ·{' '}
                  {item.itemType === 'quiz'
                    ? `${item.durationMinutes} min`
                    : item.durationPerSessionMinutes
                      ? `${item.durationPerSessionMinutes} min/session`
                      : 'you choose session length'}
                </div>
                <div>
                  {item.answered}/{item.totalQuestions} answered
                  {done && ' · Completed'}
                </div>
                <div>Purchased {toDate(item.purchasedAt).toLocaleDateString()}</div>
              </div>
            );
            return (
              <ProductCardShell
                key={`${item.itemType}_${item.id}`}
                id={item.id}
                itemType={item.itemType}
                title={item.title}
                category={item.category}
                skillLevel={item.skillLevel}
                ratingAvg={item.ratingAvg}
                ratingCount={item.ratingCount}
                price={item.price}
                originalPrice={null}
                currency={item.currency}
                detailHref={detailHref}
                extra={extra}
                footer={
                  <Link
                    to={detailHref}
                    className="block rounded-lg bg-[#155EEF] py-1.5 text-center text-sm font-semibold text-white transition-colors hover:bg-[#004EEB]"
                  >
                    Go start it →
                  </Link>
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
