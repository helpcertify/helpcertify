import { callAction } from '@/lib/vercelApi';

export interface CouponSummary {
  code: string;
  discountType: 'percent' | 'flat' | 'fixed_price';
  discountValue: number;
  active: boolean;
  expiresAt: unknown;
  maxUses: number | null;
  usedCount: number;
}

export interface CreateCouponPayload {
  code: string;
  discountType: 'percent' | 'flat' | 'fixed_price';
  discountValue: number;
  expiresAt?: string | null;
  maxUses?: number | null;
}

export const couponsApi = {
  createCoupon: (payload: CreateCouponPayload) => callAction<{ code: string }>('coupons', 'createCoupon', { ...payload }),
  listCoupons: () => callAction<{ coupons: CouponSummary[] }>('coupons', 'listCoupons'),
  updateCoupon: (payload: { code: string; active?: boolean; expiresAt?: string | null; maxUses?: number | null }) =>
    callAction<{ success: true }>('coupons', 'updateCoupon', { ...payload }),
  deleteCoupon: (code: string) => callAction<{ success: true }>('coupons', 'deleteCoupon', { code }),
};
