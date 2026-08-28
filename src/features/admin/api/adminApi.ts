import { callAction } from '@/lib/vercelApi';
import type { Timestamp } from 'firebase/firestore';

export interface DashboardStats {
  totalQuizzes: number;
  totalPracticeTests: number;
  studentAttempts: number;
  adminAccounts: number;
}

// Refer & Earn reward type/value share CouponDoc's own convention: flat is
// paise, percent is 1-95 (see api/admin.ts's getAppSettings/
// updateAppSettings for where these are actually read/applied).
export type RewardType = 'flat' | 'percent';

export interface AppSettings {
  emailOtpEnabled: boolean;
  // Always false until an SMS provider is wired up server-side — the
  // checkbox for it stays disabled in AdminSettingsPage regardless.
  mobileOtpEnabled: boolean;
  referrerRewardType: RewardType;
  referrerRewardValue: number;
  refereeRewardType: RewardType;
  refereeRewardValue: number;
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
  // {referrerReward: {type, value}, refereeReward: {type, value}} the
  // backend's updateAppSettingsSchema actually expects — keeps the
  // frontend's shape symmetric with getAppSettings's own flat response.
  updateAppSettings: (payload: AppSettings) =>
    callAction<{ success: true }>('admin', 'updateAppSettings', {
      emailOtpEnabled: payload.emailOtpEnabled,
      mobileOtpEnabled: payload.mobileOtpEnabled,
      referrerReward: { type: payload.referrerRewardType, value: payload.referrerRewardValue },
      refereeReward: { type: payload.refereeRewardType, value: payload.refereeRewardValue },
    }),

  listUsersAdmin: () => callAction<{ users: AdminUserRow[] }>('admin', 'listUsersAdmin'),
  getUserDetailAdmin: (uid: string) =>
    callAction<{ user: AdminUserRow & { avatarUrl: string | null }; orders: AdminOrderRow[] }>(
      'admin',
      'getUserDetailAdmin',
      { uid }
    ),
};
