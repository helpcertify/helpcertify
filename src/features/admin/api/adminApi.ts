import { callAction } from '@/lib/vercelApi';
import type { Timestamp } from 'firebase/firestore';

export interface DashboardStats {
  totalQuizzes: number;
  totalPracticeTests: number;
  studentAttempts: number;
  adminAccounts: number;
}

export interface AppSettings {
  emailOtpEnabled: boolean;
  // Always false until an SMS provider is wired up server-side — the
  // checkbox for it stays disabled in AdminSettingsPage regardless.
  mobileOtpEnabled: boolean;
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
  updateAppSettings: (payload: AppSettings) =>
    callAction<{ success: true }>('admin', 'updateAppSettings', { ...payload }),

  listUsersAdmin: () => callAction<{ users: AdminUserRow[] }>('admin', 'listUsersAdmin'),
  getUserDetailAdmin: (uid: string) =>
    callAction<{ user: AdminUserRow & { avatarUrl: string | null }; orders: AdminOrderRow[] }>(
      'admin',
      'getUserDetailAdmin',
      { uid }
    ),
};
