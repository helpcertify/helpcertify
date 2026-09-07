import { callAction } from '@/lib/vercelApi';

export interface CouponSummary {
  code: string;
  discountType: 'percent' | 'flat' | 'fixed_price';
  discountValue: number;
  active: boolean;
  expiresAt: unknown;
  maxUses: number | null;
  usedCount: number;
  requiresUnlockCode?: boolean;
}

export interface CouponScope {
  itemTypes?: string[];
  creatorProductIds?: string[];
  plans?: ('monthly' | 'annual')[];
}

export interface CreateCouponPayload {
  code: string;
  discountType: 'percent' | 'flat' | 'fixed_price';
  discountValue: number;
  startsAt?: string | null;
  expiresAt?: string | null;
  maxUses?: number | null;
  requiresUnlockCode?: boolean;
  perUserLimit?: number | null;
  firstPurchaseOnly?: boolean;
  minPurchaseMinor?: number | null;
  maxDiscountMinor?: number | null;
  stackable?: boolean;
  appliesTo?: CouponScope | null;
}

export interface UnlockCodeRow {
  code: string;
  parentCouponCode: string;
  used: boolean;
  usedBy: string | null;
  usedAt: unknown;
  createdAt: unknown;
}

export const couponsApi = {
  createCoupon: (payload: CreateCouponPayload) => callAction<{ code: string }>('coupons', 'createCoupon', { ...payload }),
  listCoupons: () => callAction<{ coupons: CouponSummary[] }>('coupons', 'listCoupons'),
  updateCoupon: (payload: Partial<CreateCouponPayload> & { code: string; active?: boolean }) =>
    callAction<{ success: true }>('coupons', 'updateCoupon', { ...payload }),
  deleteCoupon: (code: string) => callAction<{ success: true }>('coupons', 'deleteCoupon', { code }),
  // Companion one-time codes for a requiresUnlockCode coupon - see
  // CouponDoc's own comment.
  generateUnlockCodes: (parentCouponCode: string, count: number) =>
    callAction<{ codes: string[] }>('coupons', 'generateUnlockCodes', { parentCouponCode, count }),
  listUnlockCodes: (parentCouponCode: string) =>
    callAction<{ codes: UnlockCodeRow[] }>('coupons', 'listUnlockCodes', { parentCouponCode }),
};
