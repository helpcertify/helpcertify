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
  // Derived at read time from trainer/partner/creator-role data plus
  // approved custom-category memberships - see api/admin.ts's
  // listUsersAdmin. Built-in keys: 'trainer' | 'creator' | 'salesPartner';
  // any other value is a custom userCategories key. Empty = "Users" (no
  // category badge applies).
  categories: string[];
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
// pure decision logic. roles are keyed by category: the four built-ins
// (admin/trainer/creator/salesPartner - not the Role type) plus any
// admin-created custom userCategories key, so this is an open string-keyed
// map, not a fixed shape.
export const FEATURE_KEYS = ['ai_course_builder'] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];
export const BUILTIN_CATEGORY_KEYS = ['admin', 'trainer', 'creator', 'salesPartner'] as const;
export const BUILTIN_CATEGORY_LABELS: Record<(typeof BUILTIN_CATEGORY_KEYS)[number], string> = {
  admin: 'Admin',
  trainer: 'Trainer',
  creator: 'Content Partner',
  salesPartner: 'Sales Partner',
};
export interface FeatureAccessEntry {
  roles: Record<string, boolean>;
  allowUserIds: string[];
  denyUserIds: string[];
}
export type FeatureAccessConfig = { features: Record<FeatureKey, FeatureAccessEntry> };

export interface UserCategory {
  key: string;
  label: string;
  createdBy: string;
  createdAt: unknown;
}

export interface TrainerApplicationRow {
  id: string;
  uid: string;
  message: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewNote: string | null;
  requestedAt: unknown;
}

export interface UserCategoryRequestRow {
  id: string;
  uid: string;
  categoryKey: string;
  message: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewNote: string | null;
  requestedAt: unknown;
}

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

  // User Categories - admin-created segments beyond the four built-ins,
  // see api/admin.ts's own header comment above listUserCategories.
  listUserCategories: () => callAction<{ categories: UserCategory[] }>('admin', 'listUserCategories'),
  createUserCategory: (label: string) => callAction<{ key: string }>('admin', 'createUserCategory', { label }),
  deleteUserCategory: (key: string) => callAction<{ success: true }>('admin', 'deleteUserCategory', { key }),

  listTrainerApplications: (status?: string) =>
    callAction<{ applications: TrainerApplicationRow[] }>('admin', 'listTrainerApplications', status ? { status } : {}),
  reviewTrainerApplication: (payload: { applicationId: string; decision: 'approve' | 'reject'; note?: string }) =>
    callAction<{ success: true }>('admin', 'reviewTrainerApplication', payload),

  listUserCategoryRequests: (status?: string) =>
    callAction<{ requests: UserCategoryRequestRow[] }>('admin', 'listUserCategoryRequests', status ? { status } : {}),
  reviewUserCategoryRequest: (payload: { membershipId: string; decision: 'approve' | 'reject'; note?: string }) =>
    callAction<{ success: true }>('admin', 'reviewUserCategoryRequest', payload),
};
