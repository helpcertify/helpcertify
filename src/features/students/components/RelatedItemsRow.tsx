import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { listAvailableQuizzes, listPracticeTestsBucketed } from '../api/studentContentApi';
import { listAvailableCourses } from '../api/courseApi';
import { cartApi } from '../api/cartApi';
import { useCheckout } from '../hooks/useCheckout';
import { useUiStore } from '@/store/useUiStore';
import { activePurchaseKeys } from '../lib/purchaseAccess';
import { pickRelatedItems, type RelatableItem, type RelatedAnchor } from '../lib/relatedItems';
import { ProductCardShell } from '@/components/common/ProductCardShell';
import { BuyNowModal } from '@/components/common/BuyNowModal';
import { Spinner } from '@/components/common/Spinner';
import { errorText } from '@/lib/errorMessages';

const DETAIL_HREF: Record<RelatableItem['itemType'], (id: string) => string> = {
  quiz: (id) => `/home/quizzes/${id}`,
  practiceTest: (id) => `/home/practice-tests/${id}`,
  course: (id) => `/home/courses/${id}`,
};

const OWNED_CTA: Record<RelatableItem['itemType'], string> = {
  quiz: 'Start Mock Exam',
  practiceTest: 'Start Practice',
  course: 'Continue Reading',
};

// "You might also like" - shown on a product detail page once the learner
// has already decided this category is worth their time. Reuses the same
// available-quizzes/practice-tests/courses queries the browse pages already
// populate (React Query dedupes against whatever's cached - no extra
// network round trip in the common case of coming here from a listing
// page), and the same pickRelatedItems ranking for every item type instead
// of three separate ad-hoc filters. Self-sufficient like CourseCarousel:
// owns its own cart/purchase/buy-now state so a caller only needs to pass
// what the current item is.
export function RelatedItemsRow({ anchor }: { anchor: RelatedAnchor }) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const { checkout, paying, confirmation } = useCheckout();
  const [buyNowItem, setBuyNowItem] = useState<RelatableItem | null>(null);

  const { data: quizzes } = useQuery({ queryKey: ['student', 'availableQuizzes'], queryFn: listAvailableQuizzes });
  const { data: practiceBuckets } = useQuery({ queryKey: ['student', 'practiceTests'], queryFn: listPracticeTestsBucketed });
  const { data: courses } = useQuery({ queryKey: ['student', 'availableCourses'], queryFn: listAvailableCourses });
  const { data: purchases } = useQuery({ queryKey: ['student', 'purchases'], queryFn: cartApi.listMyPurchases });
  const { data: cart } = useQuery({ queryKey: ['student', 'cart'], queryFn: cartApi.getCart });

  const addToCartMutation = useMutation({
    mutationFn: ({ itemType, id }: { itemType: 'quiz' | 'practiceTest'; id: string }) => cartApi.addItem(itemType, id),
    onSuccess: (data) => {
      queryClient.setQueryData(['student', 'cart'], data);
      pushToast('Added to cart', 'success');
    },
    onError: (err) => pushToast(errorText(err, 'Could not add to cart'), 'error'),
  });

  const candidates: RelatableItem[] = [
    ...(quizzes ?? []).map((q) => ({
      id: q.id,
      itemType: 'quiz' as const,
      title: q.title,
      category: q.category ?? 'Other',
      skillLevel: q.skillLevel ?? 'Foundation',
      ratingAvg: q.ratingAvg ?? 0,
      ratingCount: q.ratingCount ?? 0,
      price: q.price ?? 0,
      originalPrice: q.originalPrice ?? null,
      currency: q.currency ?? 'INR',
    })),
    ...(practiceBuckets?.available ?? []).map((t) => ({
      id: t.id,
      itemType: 'practiceTest' as const,
      title: t.title,
      category: t.category ?? 'Other',
      skillLevel: t.skillLevel ?? 'Foundation',
      ratingAvg: t.ratingAvg ?? 0,
      ratingCount: t.ratingCount ?? 0,
      price: t.price ?? 0,
      originalPrice: t.originalPrice ?? null,
      currency: t.currency ?? 'INR',
    })),
    ...(courses ?? []).map((c) => ({
      id: c.id,
      itemType: 'course' as const,
      title: c.title,
      category: c.category ?? 'Other',
      skillLevel: c.skillLevel ?? 'Foundation',
      ratingAvg: c.ratingAvg ?? 0,
      ratingCount: c.ratingCount ?? 0,
      price: c.price ?? 0,
      originalPrice: c.originalPrice ?? null,
      currency: c.currency ?? 'INR',
    })),
  ];

  const purchasedSet = activePurchaseKeys(purchases?.purchases);
  const inCartSet = new Set((cart?.items ?? []).map((i) => `${i.itemType}_${i.itemId}`));
  const related = pickRelatedItems(anchor, candidates, purchasedSet);

  if (related.length === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="mb-3 text-lg font-bold text-ink">You might also like</h2>
      <div className="scrollbar-none flex items-stretch gap-3 overflow-x-auto scroll-smooth pb-1">
        {related.map((item) => {
          const href = DETAIL_HREF[item.itemType](item.id);
          const owned = item.price === 0 || purchasedSet.has(`${item.itemType}_${item.id}`);
          const inCart = inCartSet.has(`${item.itemType}_${item.id}`);

          // Courses link through to their own detail page to buy/read (no
          // direct add-to-cart button on a listing card) - same convention
          // CoursesPage/StudentHomePage already use. Quizzes and practice
          // tests get the full Add to Cart / Buy Now pair, same as
          // CourseCarousel elsewhere on the home page.
          const footer =
            item.itemType === 'course' ? (
              <Link
                to={href}
                className="block rounded-lg bg-brand-500 py-1.5 text-center text-sm font-semibold text-white transition-colors hover:bg-brand-600"
              >
                {owned ? OWNED_CTA.course : 'Add to Cart'}
              </Link>
            ) : owned ? (
              <Link
                to={href}
                className="block rounded-lg bg-brand-500 py-1.5 text-center text-sm font-semibold text-white transition-colors hover:bg-brand-600"
              >
                {OWNED_CTA[item.itemType]}
              </Link>
            ) : inCart ? (
              <Link to="/home/cart" className="block rounded-lg border border-brand-500/50 py-1.5 text-center text-sm font-semibold text-brand-ink">
                ✓ In Cart · View Cart
              </Link>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={addToCartMutation.isPending || paying}
                  onClick={() => addToCartMutation.mutate({ itemType: item.itemType as 'quiz' | 'practiceTest', id: item.id })}
                  className="flex-1 rounded-lg border border-surface-border bg-surface-raised py-1.5 text-sm font-semibold text-ink-muted transition-colors hover:border-brand-500 hover:bg-surface-sunken hover:text-brand-ink disabled:opacity-60"
                >
                  {addToCartMutation.isPending ? 'Adding…' : 'Add to Cart'}
                </button>
                <button
                  type="button"
                  disabled={paying}
                  onClick={() => setBuyNowItem(item)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-500 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
                >
                  {paying && <Spinner className="h-4 w-4" />}
                  {paying ? 'Opening…' : 'Buy Now'}
                </button>
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
              originalPrice={item.originalPrice}
              currency={item.currency}
              detailHref={href}
              compact
              footer={footer}
            />
          );
        })}
      </div>

      {buyNowItem && buyNowItem.itemType !== 'course' && (
        <BuyNowModal
          title={buyNowItem.title}
          price={buyNowItem.price}
          originalPrice={buyNowItem.originalPrice}
          currency={buyNowItem.currency}
          paying={paying}
          buyNowItem={{ itemType: buyNowItem.itemType, itemId: buyNowItem.id }}
          summaryItem={{ itemType: buyNowItem.itemType }}
          onClose={() => setBuyNowItem(null)}
          onConfirm={(consent, couponCode, _useCredit, unlockCode) => {
            checkout({
              buyNowItem: { itemType: buyNowItem.itemType, itemId: buyNowItem.id },
              items: [{ itemType: buyNowItem.itemType, itemId: buyNowItem.id, title: buyNowItem.title }],
              consent,
              couponCode,
              unlockCode,
            });
            setBuyNowItem(null);
          }}
        />
      )}
      {confirmation}
    </div>
  );
}
