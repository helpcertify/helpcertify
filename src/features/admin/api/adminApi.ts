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
// no type selector - see CreditLedgerEntryDoc).
export type RewardType = 'flat' | 'percent';

export interface AppSettings {
  emailOtpEnabled: boolean;
  // Global feature flag: when true, students and admins get a light/dark
  // toggle; when false the whole app is light-only. Stored on the
  // publicly-readable appSettings/appearance doc, not appSettings/general.
  darkModeEnabled: boolean;
  // Always false until an SMS provider is wired up server-side - the
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

// Admin-editable public contact / legal facts (appSettings/company). Every
// value is a plain string; a blank one means "fall back to the compile-time
// default in src/features/marketing/companyInfo.ts".
export interface CompanyInfoSettings {
  operatorName: string;
  operatorType: string;
  operatorCountry: string;
  registeredAddress: string;
  jurisdiction: string;
  contactEmail: string;
  contactPhone: string;
  grievanceEmail: string;
  grievanceOfficer: string;
  grievanceOfficerTitle: string;
  gstin: string;
  udyamNumber: string;
}

// Feature Access - see api/admin.ts's getFeatureAccessConfig/
// updateFeatureAccessConfig and src/features/admin/lib/featureAccess.ts's
// pure decision logic. roles are the app's actual capability model
// (admin/trainer/creator), not the Role type.
export const FEATURE_KEYS = ['ai_course_builder'] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];
export interface FeatureAccessEntry {
  roles: { admin: boolean; trainer: boolean; creator: boolean };
  allowUserIds: string[];
  denyUserIds: string[];
}
export type FeatureAccessConfig = { features: Record<FeatureKey, FeatureAccessEntry> };

export const adminApi = {
  getDashboardStats: () => callAction<DashboardStats>('admin', 'getDashboardStats'),
  getCompanyInfo: () => callAction<CompanyInfoSettings>('admin', 'getCompanyInfo'),
  updateCompanyInfo: (payload: CompanyInfoSettings) =>
    callAction<{ success: true }>('admin', 'updateCompanyInfo', { ...payload }),

  getCustomExamBuilderSettings: () =>
    callAction<{ priceMinor: number; originalPriceMinor: number | null; currency: 'INR' | 'USD'; isEnabled: boolean }>(
      'admin',
      'getCustomExamBuilderSettings'
    ),
  updateCustomExamBuilderSettings: (payload: {
    priceMinor: number;
    originalPriceMinor: number | null;
    currency: 'INR' | 'USD';
    isEnabled: boolean;
  }) => callAction<{ success: true }>('admin', 'updateCustomExamBuilderSettings', payload),
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
  // actually expects - keeps the frontend's shape symmetric with
  // getAppSettings's own flat response.
  updateAppSettings: (payload: AppSettings) =>
    callAction<{ success: true }>('admin', 'updateAppSettings', {
      emailOtpEnabled: payload.emailOtpEnabled,
      darkModeEnabled: payload.darkModeEnabled,
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
    callAction<{ user: AdminUserRow & { avatarUrl: string | null; trainerId?: string | null }; orders: AdminOrderRow[] }>(
      'admin',
      'getUserDetailAdmin',
      { uid }
    ),

  grantTrainerStatus: (userId: string) => callAction<{ trainerId: string }>('admin', 'grantTrainerStatus', { userId }),
  revokeTrainerStatus: (userId: string) => callAction<{ success: true }>('admin', 'revokeTrainerStatus', { userId }),

  // Item 11/15 - the minimal admin refund action and the Referral Audit
  // list (see api/admin.ts's refundOrder/listReferralsAdmin).
  // amountMinor omitted = full refund of whatever is still refundable.
  refundOrder: (orderId: string, reason: string, amountMinor?: number) =>
    callAction<{ success: true }>('admin', 'refundOrder', { orderId, reason, ...(amountMinor ? { amountMinor } : {}) }),
  listReferralsAdmin: () => callAction<{ referrals: AdminReferralRow[] }>('admin', 'listReferralsAdmin'),

  getFeatureAccessConfig: () => callAction<FeatureAccessConfig>('admin', 'getFeatureAccessConfig'),
  updateFeatureAccessConfig: (features: Record<FeatureKey, FeatureAccessEntry>) =>
    callAction<{ success: true }>('admin', 'updateFeatureAccessConfig', { features }),
};
