import { callAction } from '@/lib/vercelApi';
import type { PurchasableItemType } from '@/types/models';

export interface ReviewView {
  id: string;
  userId: string;
  userName: string;
  itemType: PurchasableItemType;
  itemId: string;
  rating: number;
  comment: string;
  // Serialized Firestore Timestamp over JSON — { _seconds, _nanoseconds },
  // not { seconds }. Read via @/utils/formatDate's toDate().
  createdAt: unknown;
  updatedAt: unknown;
}

export const reviewsApi = {
  listReviews: (itemType: PurchasableItemType, itemId: string) =>
    callAction<{ reviews: ReviewView[] }>('reviews', 'listReviews', { itemType, itemId }),
  getMyReview: (itemType: PurchasableItemType, itemId: string) =>
    callAction<{ review: ReviewView | null }>('reviews', 'getMyReview', { itemType, itemId }),
  submitReview: (itemType: PurchasableItemType, itemId: string, rating: number, comment: string) =>
    callAction<{ success: true }>('reviews', 'submitReview', { itemType, itemId, rating, comment }),
  deleteReview: (itemType: PurchasableItemType, itemId: string) =>
    callAction<{ success: true }>('reviews', 'deleteReview', { itemType, itemId }),
};
