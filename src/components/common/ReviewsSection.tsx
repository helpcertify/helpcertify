import { useState, useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { reviewsApi } from '@/features/students/api/reviewsApi';
import { useUiStore } from '@/store/useUiStore';
import { toDate } from '@/utils/formatDate';
import { StarRating } from './StarRating';
import type { PurchasableItemType } from '@/types/models';

interface ReviewsSectionProps {
  itemType: PurchasableItemType;
  itemId: string;
  // Reviewing is gated to ownership (free items count as owned too), same
  // as every other owned-check in this app — the caller already computes
  // this for its own CTA logic, so it's passed in rather than recomputed.
  owned: boolean;
}

// Shared by QuizDetailPage and PracticeTestDetailPage — the review form
// (write/edit/delete your own review) plus the list of everyone else's,
// under a single "Reviews" heading. Submitting invalidates the parent
// quiz/practiceTest queries too, since ratingAvg/ratingCount live
// denormalized on that doc and change every time a review does.
export function ReviewsSection({ itemType, itemId, owned }: ReviewsSectionProps) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [editing, setEditing] = useState(false);

  const { data: reviewsData } = useQuery({
    queryKey: ['student', 'reviews', itemType, itemId],
    queryFn: () => reviewsApi.listReviews(itemType, itemId),
  });
  const { data: myReviewData } = useQuery({
    queryKey: ['student', 'myReview', itemType, itemId],
    queryFn: () => reviewsApi.getMyReview(itemType, itemId),
    enabled: owned,
  });
  const myReview = myReviewData?.review ?? null;

  // Seed the form from the existing review once it loads, so opening it to
  // edit doesn't start blank. Only while not actively editing, so a change
  // in flight never gets clobbered by a background refetch.
  useEffect(() => {
    if (myReview && !editing) {
      setRating(myReview.rating);
      setComment(myReview.comment);
    }
  }, [myReview, editing]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['student', 'reviews', itemType, itemId] });
    queryClient.invalidateQueries({ queryKey: ['student', 'myReview', itemType, itemId] });
    // ratingAvg/ratingCount are denormalized onto the parent doc.
    queryClient.invalidateQueries({ queryKey: ['student', 'quiz', itemId] });
    queryClient.invalidateQueries({ queryKey: ['student', 'practiceTest', itemId] });
    queryClient.invalidateQueries({ queryKey: ['student', 'availableQuizzes'] });
    queryClient.invalidateQueries({ queryKey: ['student', 'practiceTests'] });
  };

  const submitMutation = useMutation({
    mutationFn: () => reviewsApi.submitReview(itemType, itemId, rating, comment),
    onSuccess: () => {
      pushToast(myReview ? 'Review updated' : 'Review submitted', 'success');
      invalidateAll();
      setEditing(false);
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : 'Could not submit review', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => reviewsApi.deleteReview(itemType, itemId),
    onSuccess: () => {
      pushToast('Review deleted', 'success');
      setRating(0);
      setComment('');
      invalidateAll();
    },
    onError: () => pushToast('Could not delete review', 'error'),
  });

  const reviews = reviewsData?.reviews ?? [];

  return (
    <div className="mt-6">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-faint">
        Reviews{reviews.length > 0 ? ` (${reviews.length})` : ''}
      </h2>

      {owned && (
        <div className="mb-5 rounded-xl border border-surface-border bg-surface p-4">
          {myReview && !editing ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="mb-1 text-xs text-ink-faint">Your review</div>
                <StarRating value={myReview.rating} size="sm" />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="rounded-lg border border-surface-border px-3 py-1.5 text-xs text-ink-muted hover:border-brand-400"
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate()}
                  className="rounded-lg border border-surface-border px-3 py-1.5 text-xs text-ink-muted hover:border-red-500/50 hover:text-red-400 disabled:opacity-60"
                >
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">
                {myReview ? 'Update your review' : 'Rate this'}
              </div>
              <StarRating value={rating} onChange={setRating} size="lg" />
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="Share what you thought (optional)"
                className="input-dark mt-3"
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={rating === 0 || submitMutation.isPending}
                  onClick={() => submitMutation.mutate()}
                  className="rounded-lg bg-[#155EEF] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {submitMutation.isPending ? 'Saving…' : myReview ? 'Save Changes' : 'Submit Review'}
                </button>
                {myReview && (
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {reviews.length === 0 ? (
        <p className="text-sm text-ink-faint">No reviews yet.</p>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <div key={r.id} className="rounded-lg border border-surface-border p-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-ink">{r.userName || 'Learner'}</span>
                <StarRating value={r.rating} size="sm" />
              </div>
              {r.comment && <p className="text-sm text-ink-muted">{r.comment}</p>}
              <div className="mt-1 text-xs text-ink-faint">{toDate(r.updatedAt).toLocaleDateString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
