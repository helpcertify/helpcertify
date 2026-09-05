import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { getCourseById, courseApi } from '../api/courseApi';
import { cartApi } from '../api/cartApi';
import { useCheckout } from '../hooks/useCheckout';
import { useUiStore } from '@/store/useUiStore';
import { formatMoney } from '@/utils/currency';
import { BuyNowModal } from '@/components/common/BuyNowModal';
import { Spinner } from '@/components/common/Spinner';
import { CourseIcon } from '@/components/common/CourseIcon';
import { StarRating } from '@/components/common/StarRating';
import { activePurchaseKeys } from '../lib/purchaseAccess';
import { CourseLessonReader } from '../components/CourseLessonReader';
import { errorText } from '@/lib/errorMessages';

// Structural sibling of QuizDetailPage - same header/Course-Access-card
// layout - but with an inline lesson list + reader instead of a "take"
// flow, since reading a course has no timed session/attempt concept.
export function CourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const { checkout, paying, confirmation } = useCheckout();
  const [showBuyNow, setShowBuyNow] = useState(false);
  const [activeLessonIndex, setActiveLessonIndex] = useState(0);

  const { data: course, isLoading } = useQuery({
    queryKey: ['student', 'course', courseId],
    queryFn: () => getCourseById(courseId!),
    enabled: !!courseId,
  });
  const { data: purchases } = useQuery({ queryKey: ['student', 'purchases'], queryFn: cartApi.listMyPurchases });
  const { data: cart } = useQuery({ queryKey: ['student', 'cart'], queryFn: cartApi.getCart });
  const { data: reading } = useQuery({
    queryKey: ['student', 'courseReading', courseId],
    queryFn: () => courseApi.getForReading(courseId!),
    enabled: !!courseId,
  });

  const addToCartMutation = useMutation({
    mutationFn: (id: string) => cartApi.addItem('course', id),
    onSuccess: (data) => {
      queryClient.setQueryData(['student', 'cart'], data);
      pushToast('Added to cart', 'success');
    },
    onError: (err) => pushToast(errorText(err, 'Could not add to cart'), 'error'),
  });

  const markCompleteMutation = useMutation({
    mutationFn: (lessonIndex: number) => courseApi.markLessonComplete(courseId!, lessonIndex),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['student', 'courseReading', courseId] }),
  });

  if (isLoading) {
    return <p className="text-sm text-ink-faint">Loading…</p>;
  }
  if (!course) {
    return (
      <div className="rounded-xl border border-dashed border-surface-border p-8 text-center">
        <p className="mb-4 text-ink-faint">This course doesn't exist or is no longer available.</p>
        <Link to="/home/courses" className="rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted hover:border-brand-400">
          Back to Courses
        </Link>
      </div>
    );
  }

  const price = course.price ?? 0;
  const purchasedSet = activePurchaseKeys(purchases?.purchases);
  const inCartSet = new Set((cart?.items ?? []).map((i) => `${i.itemType}_${i.itemId}`));
  const owned = purchasedSet.has(`course_${course.id}`) || price === 0;
  const inCart = inCartSet.has(`course_${course.id}`);
  const lessons = reading?.lessons ?? [];
  const activeLesson = lessons[activeLessonIndex];

  return (
    <div className="mx-auto w-[calc(100%-48px)] max-w-[1440px]">
      <Link to="/home/courses" className="mb-4 inline-block text-sm text-brand-ink hover:underline">
        ← Back to Courses
      </Link>

      {course.coverImageUrl && (
        <div className="mb-4 overflow-hidden rounded-xl border border-surface-border">
          <img src={course.coverImageUrl} alt="" className="h-56 w-full object-cover" />
          {course.coverImageCredit && (
            <div className="bg-surface-raised px-3 py-1 text-right text-[11px] text-ink-faint">
              Photo:{' '}
              {course.coverImageSourceUrl ? (
                <a href={course.coverImageSourceUrl} target="_blank" rel="noreferrer" className="underline">
                  {course.coverImageCredit}
                </a>
              ) : (
                course.coverImageCredit
              )}{' '}
              via{' '}
              <a href="https://www.pexels.com" target="_blank" rel="noreferrer" className="underline">
                Pexels
              </a>
            </div>
          )}
        </div>
      )}

      <div className="mb-6 flex flex-col justify-between gap-6 rounded-xl border border-surface-border bg-surface-raised p-6 shadow-card sm:flex-row sm:items-center">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">
            <span>{course.category ?? 'Other'}</span>
            <span>·</span>
            <span>{course.skillLevel ?? 'Foundation'}</span>
          </div>
          <h1 className="mb-2 text-[28px] font-bold leading-tight text-ink">{course.title}</h1>

          {(course.ratingCount ?? 0) > 0 && (
            <div className="mb-3 flex items-center gap-2">
              <StarRating value={course.ratingAvg ?? 0} size="sm" />
              <span className="text-sm text-ink-faint">
                {(course.ratingAvg ?? 0).toFixed(1)} ({course.ratingCount} review{course.ratingCount === 1 ? '' : 's'})
              </span>
            </div>
          )}

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
            <span>▤ {course.totalLessons} Lesson{course.totalLessons === 1 ? '' : 's'}</span>
          </div>

          {course.description && (
            <p className="mt-4 max-w-[760px] whitespace-pre-line text-sm leading-relaxed text-ink">{course.description}</p>
          )}
        </div>

        {!course.coverImageUrl && (
          <div className="hidden shrink-0 items-center justify-center rounded-xl bg-brand-50 p-6 sm:flex">
            <div className="scale-[1.8]">
              <CourseIcon id={course.id} title={course.title} itemType="course" />
            </div>
          </div>
        )}
      </div>

      {!owned && (
        <div className="mb-6 max-w-sm rounded-xl border border-surface-border bg-surface-raised p-6 shadow-card">
          <h2 className="mb-4 text-[15px] font-bold uppercase tracking-wide text-brand-ink">Course Access</h2>

          {price > 0 && (
            <div className="mb-4 flex items-center gap-2">
              {course.originalPrice && course.originalPrice > price && (
                <span className="text-sm text-ink-faint line-through">{formatMoney(course.originalPrice, course.currency)}</span>
              )}
              <span className="text-[26px] font-bold text-ink">{formatMoney(price, course.currency)}</span>
            </div>
          )}

          {inCart ? (
            <Link
              to="/home/cart"
              className="block rounded-lg border border-brand-500 py-2.5 text-center text-sm font-semibold text-brand-ink hover:bg-brand-500/10"
            >
              ✓ In Cart · View Cart
            </Link>
          ) : (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={paying}
                onClick={() => setShowBuyNow(true)}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
              >
                {paying && <Spinner className="h-4 w-4" />}
                {paying ? 'Opening…' : 'Buy Now'}
              </button>
              <button
                type="button"
                disabled={addToCartMutation.isPending || paying}
                onClick={() => addToCartMutation.mutate(course.id)}
                className="w-full rounded-lg border border-brand-500 py-2.5 text-sm font-semibold text-brand-ink hover:bg-brand-500/10 disabled:opacity-60"
              >
                {addToCartMutation.isPending ? 'Adding…' : 'Add to Cart'}
              </button>
            </div>
          )}
        </div>
      )}

      {lessons.length > 0 && (
        <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-[0.35fr_0.65fr]">
          <div className="space-y-1.5 rounded-xl border border-surface-border bg-surface-raised p-4 shadow-card">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-faint">Lessons</h2>
            {lessons.map((l, i) => {
              const completed = (reading?.completedLessonIndexes ?? []).includes(i);
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setActiveLessonIndex(i)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                    i === activeLessonIndex ? 'bg-brand-50 text-brand-ink' : 'text-ink-muted hover:bg-surface'
                  }`}
                >
                  <span className="truncate">
                    {i + 1}. {l.title}
                  </span>
                  {l.locked ? <span className="shrink-0 text-xs">🔒</span> : completed ? <span className="shrink-0 text-xs">✓</span> : null}
                </button>
              );
            })}
          </div>

          <div className="rounded-xl border border-surface-border bg-surface-raised p-6 shadow-card">
            {activeLesson?.locked ? (
              <div className="py-8 text-center">
                <p className="mb-4 text-sm text-ink-faint">This lesson is locked. Buy the course to keep reading.</p>
                <button
                  type="button"
                  onClick={() => setShowBuyNow(true)}
                  className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
                >
                  Buy Now
                </button>
              </div>
            ) : (
              <>
                {activeLesson && (
                  <CourseLessonReader
                    lesson={activeLesson}
                    owned={owned}
                    isRead={(reading?.completedLessonIndexes ?? []).includes(activeLessonIndex)}
                    marking={markCompleteMutation.isPending}
                    onMarkRead={() => markCompleteMutation.mutate(activeLessonIndex)}
                  />
                )}
                <div className="mt-4 flex justify-between">
                  <button
                    type="button"
                    disabled={activeLessonIndex === 0}
                    onClick={() => setActiveLessonIndex((i) => Math.max(0, i - 1))}
                    className="rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted disabled:opacity-40"
                  >
                    ← Previous
                  </button>
                  <button
                    type="button"
                    disabled={activeLessonIndex >= lessons.length - 1}
                    onClick={() => setActiveLessonIndex((i) => Math.min(lessons.length - 1, i + 1))}
                    className="rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted disabled:opacity-40"
                  >
                    Next →
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showBuyNow && (
        <BuyNowModal
          title={course.title}
          price={price}
          originalPrice={course.originalPrice ?? null}
          currency={course.currency ?? 'INR'}
          paying={paying}
          summaryItem={{ itemType: 'course', accessPeriodDays: course.accessPeriodDays }}
          onClose={() => setShowBuyNow(false)}
          onConfirm={(consent, couponCode, useCredit, unlockCode) => {
            checkout({
              buyNowItem: { itemType: 'course', itemId: course.id },
              items: [{ itemType: 'course', itemId: course.id, title: course.title }],
              consent,
              couponCode,
              useCredit,
              unlockCode,
            });
            setShowBuyNow(false);
          }}
        />
      )}
      {confirmation}
    </div>
  );
}
