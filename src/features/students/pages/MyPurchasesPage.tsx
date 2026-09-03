import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { cartApi } from '../api/cartApi';
import { useCertificationCatalog } from '../api/certificationCatalogApi';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { toDate } from '@/utils/formatDate';
import { formatMoney } from '@/utils/currency';
import { ProductCardShell } from '@/components/common/ProductCardShell';

interface PurchasedItem {
  itemType: 'quiz' | 'practiceTest';
  id: string;
  title: string;
  category: string;
  skillLevel: string;
  totalQuestions: number;
  durationMinutes: number | undefined;
  durationPerSessionMinutes: number | null | undefined;
  ratingAvg: number;
  ratingCount: number;
  price: number;
  currency: 'INR' | 'USD';
  purchasedAt: unknown;
  expiresAt: unknown;
  answered: number;
}

function formatDate(v: unknown): string {
  return v ? toDate(v).toLocaleDateString() : '-';
}

// Billing & Orders - a receipts list at the top (what was actually paid),
// then the purchased content grouped one card per certification.
export function MyPurchasesPage() {
  const uid = useAuthStore((s) => s.firebaseUser?.uid);
  const { data: purchases } = useQuery({ queryKey: ['student', 'purchases'], queryFn: cartApi.listMyPurchases });
  const { data: ordersData } = useQuery({ queryKey: ['student', 'myOrders'], queryFn: cartApi.listMyOrders });
  const { data: catalog } = useCertificationCatalog();

  const { data: items, isLoading } = useQuery({
    queryKey: ['student', 'purchasedItems', purchases?.purchases],
    queryFn: async (): Promise<PurchasedItem[]> => {
      const list = (purchases?.purchases ?? []).filter(
        (p): p is typeof p & { itemType: 'quiz' | 'practiceTest' } => p.itemType === 'quiz' || p.itemType === 'practiceTest',
      );
      const results = await Promise.all(
        list.map(async (p) => {
          const collectionName = p.itemType === 'quiz' ? 'quizzes' : 'practiceTests';
          const snap = await getDoc(doc(db, collectionName, p.itemId));
          if (!snap.exists()) return null;
          const data = snap.data();
          let answered = 0;
          if (p.itemType === 'quiz') {
            const attemptSnap = await getDocs(
              query(collection(db, 'quizAttempts'), where('userId', '==', uid), where('quizId', '==', p.itemId)),
            );
            answered = (attemptSnap.docs[0]?.data().answeredCount as number | undefined) ?? 0;
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
        }),
      );
      return results.filter((x): x is PurchasedItem => x !== null);
    },
    enabled: !!purchases && !!uid,
  });

  const orders = [...(ordersData?.orders ?? [])].sort(
    (a, b) => toDate(b.paidAt ?? b.createdAt).getTime() - toDate(a.paidAt ?? a.createdAt).getTime(),
  );

  // item id -> certification name, from the catalog's packages.
  const certNameById = new Map<string, string>();
  for (const cert of catalog?.certifications ?? []) {
    for (const pkg of cert.packages) {
      for (const id of pkg.includedPracticeTestIds) certNameById.set(id, cert.name);
      for (const id of pkg.includedQuizIds) certNameById.set(id, cert.name);
    }
  }

  const grouped = new Map<string, PurchasedItem[]>();
  const ungrouped: PurchasedItem[] = [];
  for (const it of items ?? []) {
    const certName = certNameById.get(it.id);
    if (certName) {
      const g = grouped.get(certName) ?? [];
      g.push(it);
      grouped.set(certName, g);
    } else {
      ungrouped.push(it);
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-ink">Billing & Orders</h1>
      <p className="mb-6 text-sm text-ink-faint">Your payment history and everything it unlocked.</p>

      {orders.length > 0 && (
        <div className="mb-8 overflow-hidden rounded-xl border border-surface-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-raised text-xs uppercase tracking-wide text-ink-faint">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Payment ID</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-3 text-ink">
                    {o.items.map((i) => i.title).join(', ') || 'Order'}
                    {o.items[0]?.accessPeriodLabel && (
                      <span className="ml-1 text-xs text-ink-faint">· {o.items[0].accessPeriodLabel}</span>
                    )}
                    {o.couponCode && <span className="ml-1 text-xs text-ink-faint">· coupon {o.couponCode}</span>}
                  </td>
                  <td className="px-4 py-3 text-ink-faint">{formatDate(o.paidAt ?? o.createdAt)}</td>
                  <td className="px-4 py-3 text-ink">{formatMoney(o.amount, o.currency as 'INR' | 'USD')}</td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-faint">{o.razorpayPaymentId ?? '-'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        o.status === 'refunded'
                          ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                          : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      }`}
                    >
                      {o.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-faint">Your content</h2>

      {isLoading ? (
        <p className="text-sm text-ink-faint">Loading…</p>
      ) : (items ?? []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-surface-border p-8 text-center">
          <p className="mb-4 text-ink-faint">You haven't purchased anything yet.</p>
          <div className="flex justify-center gap-3">
            <Link to="/home/mock-exams" className="rounded-lg bg-[#155EEF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#004EEB]">
              Browse Mock Exams
            </Link>
            <Link to="/home/practice-tests" className="rounded-lg bg-[#155EEF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#004EEB]">
              Browse Practice Exams
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {[...grouped.entries()].map(([certName, groupItems]) => {
            const practiceCount = groupItems.filter((i) => i.itemType === 'practiceTest').length;
            const mockCount = groupItems.filter((i) => i.itemType === 'quiz').length;
            const totalQuestions = groupItems.reduce((s, i) => s + i.totalQuestions, 0);
            const answered = groupItems.reduce((s, i) => s + i.answered, 0);
            const withExpiry = groupItems.find((i) => i.expiresAt != null);
            const expired = withExpiry && toDate(withExpiry.expiresAt).getTime() < Date.now();
            return (
              <div
                key={certName}
                className="rounded-xl border border-[#BFDBFE] bg-white p-5 shadow-[0_2px_8px_rgba(15,23,42,0.05)] dark:bg-surface-raised"
              >
                <h3 className="text-base font-bold text-[#155EEF]">{certName}</h3>
                <p className="mt-1 text-xs text-ink-faint">
                  {practiceCount > 0 && `${practiceCount} practice exam${practiceCount === 1 ? '' : 's'}`}
                  {practiceCount > 0 && mockCount > 0 && ' · '}
                  {mockCount > 0 && `${mockCount} mock exam${mockCount === 1 ? '' : 's'}`}
                  {totalQuestions > 0 && ` · ${answered.toLocaleString()} / ${totalQuestions.toLocaleString()} answered`}
                </p>
                {withExpiry && (
                  <p className={`mt-1 text-xs ${expired ? 'font-semibold text-[#C2410C]' : 'text-ink-faint'}`}>
                    {expired
                      ? `Access expired ${formatDate(withExpiry.expiresAt)} · buy the package again to renew`
                      : `Access until ${formatDate(withExpiry.expiresAt)}`}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {practiceCount > 0 && (
                    <Link
                      to="/home/practice-tests"
                      className="rounded-lg bg-[#155EEF] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#004EEB]"
                    >
                      Practice Exams →
                    </Link>
                  )}
                  {mockCount > 0 && (
                    <Link
                      to="/home/mock-exams"
                      className="rounded-lg border border-[#155EEF] px-4 py-1.5 text-sm font-semibold text-[#155EEF] hover:bg-[#EFF6FF]"
                    >
                      Mock Exams →
                    </Link>
                  )}
                </div>
              </div>
            );
          })}

          {ungrouped.length > 0 && (
            <div className="flex flex-wrap gap-4 pt-2">
              {ungrouped.map((item) => {
                const detailHref =
                  item.itemType === 'quiz' ? `/home/quizzes/${item.id}` : `/home/practice-tests/${item.id}`;
                const done = item.totalQuestions > 0 && item.answered >= item.totalQuestions;
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
                    extra={
                      <div className="mb-3 space-y-1 text-xs text-[#64748B]">
                        <div>
                          {item.answered}/{item.totalQuestions} answered{done && ' · Completed'}
                        </div>
                        <div>Purchased {formatDate(item.purchasedAt)}</div>
                      </div>
                    }
                    footer={
                      <Link
                        to={detailHref}
                        className="block rounded-lg bg-[#155EEF] py-1.5 text-center text-sm font-semibold text-white hover:bg-[#004EEB]"
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
      )}
    </div>
  );
}
