import { callAction } from '@/lib/vercelApi';

export interface DashboardStats {
  totalQuizzes: number;
  totalPracticeTests: number;
  studentAttempts: number;
  adminAccounts: number;
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
};
