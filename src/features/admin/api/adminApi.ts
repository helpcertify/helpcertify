import { callAction } from '@/lib/vercelApi';
import type { Timestamp } from 'firebase/firestore';

export interface DashboardStats {
  totalQuizzes: number;
  totalPracticeTests: number;
  studentAttempts: number;
  adminAccounts: number;
}

// Refer & Earn's referee reward shares CouponDoc's own convention: flat is
// paise, percent is 1-95 (see api/admin.ts's getAppSettings/
// updateAppSettings for where these are actually read/applied). The
// referrer's reward is always a flat credit amount now (not a coupon, so
// no type selector — see CreditLedgerEntryDoc).
export type RewardType = 'flat' | 'percent';

export interface AppSettings {
  emailOtpEnabled: boolean;
  // Always false until an SMS provider is wired up server-side — the
  // checkbox for it stays disabled in AdminSettingsPage regardless.
  mobileOtpEnabled: boolean;
  referralCreditAmountMinor: number;
  referralValidationPeriodDays: number;
  referralCreditExpiryDays: number;
  referralMonthlyLimit: number;
  referralCreditMaxPercent: number;
  referralEligibleItemIds: string[];
  refereeRewardType: RewardType;
  refereeRewardValue: number;
}

export interface AdminReferralRow {
  id: string;
  referrerName: string;
  referrerEmail: string;
  refereeName: string;
  refereeUid: string;
  status: string;
  rejectionReason: string | null;
  qualifyingOrderId: string | null;
  creditEntryId: string | null;
  createdAt: Timestamp;
  rewardedAt: Timestamp | null;
}

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  emailVerified: boolean;
  createdAt: Timestamp;
  purchaseCount: number;
}

export interface AdminOrderRow {
  id: string;
  items: { itemType: string; itemId: string; title: string; unitPrice: number }[];
  total: number;
  currency: 'INR' | 'USD';
  createdAt: Timestamp;
}

export const adminApi = {
  getDashboardStats: () => callAction<DashboardStats>('admin', 'getDashboardStats'),
  createAdminAccount: (payload: { name: string; email: string; password: string }) =>
    callAction<{ uid: string }>('admin', 'createAdminAccount', payload),
  listAdminAccounts: () =>
    callAction<{ accounts: { id: string; name: string; email: string; isActive: boolean }[] }>(
      'admin',
      'listAdminAccounts'
    ),

  getAppSettings: () => callAction<AppSettings>('admin', 'getAppSettings'),
  // Reshapes the flat AppSettings the page works with into the
  // {refereeReward: {type, value}} the backend's updateAppSettingsSchema
  // actually expects — keeps the frontend's shape symmetric with
  // getAppSettings's own flat response.
  updateAppSettings: (payload: AppSettings) =>
    callAction<{ success: true }>('admin', 'updateAppSettings', {
      emailOtpEnabled: payload.emailOtpEnabled,
      mobileOtpEnabled: payload.mobileOtpEnabled,
      referralCreditAmountMinor: payload.referralCreditAmountMinor,
      referralValidationPeriodDays: payload.referralValidationPeriodDays,
      referralCreditExpiryDays: payload.referralCreditExpiryDays,
      referralMonthlyLimit: payload.referralMonthlyLimit,
      referralCreditMaxPercent: payload.referralCreditMaxPercent,
      referralEligibleItemIds: payload.referralEligibleItemIds,
      refereeReward: { type: payload.refereeRewardType, value: payload.refereeRewardValue },
    }),

  listUsersAdmin: () => callAction<{ users: AdminUserRow[] }>('admin', 'listUsersAdmin'),
  getUserDetailAdmin: (uid: string) =>
    callAction<{ user: AdminUserRow & { avatarUrl: string | null }; orders: AdminOrderRow[] }>(
      'admin',
      'getUserDetailAdmin',
      { uid }
    ),

  // Item 11/15 — the minimal admin refund action and the Referral Audit
  // list (see api/admin.ts's refundOrder/listReferralsAdmin).
  refundOrder: (orderId: string, reason: string) => callAction<{ success: true }>('admin', 'refundOrder', { orderId, reason }),
  listReferralsAdmin: () => callAction<{ referrals: AdminReferralRow[] }>('admin', 'listReferralsAdmin'),
};
