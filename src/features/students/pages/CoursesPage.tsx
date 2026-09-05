import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listAvailableCourses } from '../api/courseApi';
import { cartApi } from '../api/cartApi';
import { activePurchaseKeys } from '../lib/purchaseAccess';
import { ProductCardShell } from '@/components/common/ProductCardShell';

// Written-lesson courses (AI Course Builder output, see
// api/content-admin.ts's publishCatalogSubmission). Flat grid, no series
// batching like Mock Exams/Practice Tests need - a course isn't split
// into numbered batches.
export function CoursesPage() {
  const { data: courses } = useQuery({ queryKey: ['student', 'availableCourses'], queryFn: listAvailableCourses });
  const { data: purchases } = useQuery({ queryKey: ['student', 'purchases'], queryFn: cartApi.listMyPurchases });
  const purchasedSet = activePurchaseKeys(purchases?.purchases);

  const list = courses ?? [];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-ink">Courses</h1>
      <p className="mb-6 text-sm text-ink-faint">Written lessons you can read at your own pace.</p>

      {list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-surface-border p-6 text-center text-sm text-ink-faint">
          No courses are available yet.
        </p>
      ) : (
        <div className="flex flex-wrap gap-4">
          {list.map((c) => {
            const owned = purchasedSet.has(`course_${c.id}`);
            return (
              <ProductCardShell
                key={c.id}
                id={c.id}
                itemType="course"
                title={c.title}
                category={c.category}
                skillLevel={c.skillLevel}
                ratingAvg={c.ratingAvg}
                ratingCount={c.ratingCount}
                price={c.price}
                originalPrice={c.originalPrice}
                currency={c.currency}
                detailHref={`/home/courses/${c.id}`}
                footer={
                  <Link
                    to={`/home/courses/${c.id}`}
                    className="block rounded-lg bg-[#155EEF] py-1.5 text-center text-sm font-semibold text-white transition-colors hover:bg-[#004EEB]"
                  >
                    {owned ? 'Continue Reading' : 'View'}
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
