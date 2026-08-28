import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { AdminShell } from '@/components/layout/AdminShell';
import { StudentShell } from '@/components/layout/StudentShell';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { RegisterPage } from '@/features/auth/pages/RegisterPage';
import { VerifyEmailPage } from '@/features/auth/pages/VerifyEmailPage';
import { LandingPage } from '@/features/landing/pages/LandingPage';
import { LegalPlaceholderPage } from '@/features/landing/pages/LegalPlaceholderPage';
import { AdminHomePage } from '@/features/admin/pages/AdminHomePage';
import { ExamQuizStudioPage } from '@/features/admin/pages/ExamQuizStudioPage';
import { QuizAnswerKeyPage } from '@/features/admin/pages/QuizAnswerKeyPage';
import { PracticeManagerPage } from '@/features/admin/pages/PracticeManagerPage';
import { PracticeTestAnswerKeyPage } from '@/features/admin/pages/PracticeTestAnswerKeyPage';
import { PerformancePage } from '@/features/admin/pages/PerformancePage';
import { StudentHomePage } from '@/features/students/pages/StudentHomePage';
import { MockExamsPage } from '@/features/students/pages/MockExamsPage';
import { PastQuizzesPage } from '@/features/students/pages/PastQuizzesPage';
import { StudentQuizDashboardPage } from '@/features/students/pages/StudentQuizDashboardPage';
import { PracticeTestsPage } from '@/features/students/pages/PracticeTestsPage';
import { QuizDetailPage } from '@/features/students/pages/QuizDetailPage';
import { PracticeTestDetailPage } from '@/features/students/pages/PracticeTestDetailPage';
import { QuizTakingPage } from '@/features/students/pages/QuizTakingPage';
import { PracticeTakingPage } from '@/features/students/pages/PracticeTakingPage';
import { CartPage } from '@/features/students/pages/CartPage';
import { MyPurchasesPage } from '@/features/students/pages/MyPurchasesPage';
import { WishlistPage } from '@/features/students/pages/WishlistPage';
import { ProfilePage } from '@/features/students/pages/ProfilePage';
import { SettingsPage } from '@/features/students/pages/SettingsPage';
import { SearchResultsPage } from '@/features/students/pages/SearchResultsPage';
import { HelpPage } from '@/features/students/pages/HelpPage';
import { CouponsPage } from '@/features/admin/pages/CouponsPage';
import { AdminSettingsPage } from '@/features/admin/pages/AdminSettingsPage';
import { AdminUsersPage } from '@/features/admin/pages/AdminUsersPage';
import { AdminReferralAuditPage } from '@/features/admin/pages/AdminReferralAuditPage';

// v2 route map (Quiz + Practice Test platform). Replaced the v1
// course/exam/certificate routes on 2026-08-22 — see
// functions/src/_migrated-v1-reference/README.md for what this replaced.
export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/privacy" element={<LegalPlaceholderPage title="Privacy Policy" />} />
      <Route path="/terms" element={<LegalPlaceholderPage title="Terms of Service" />} />

      <Route element={<ProtectedRoute allowedRoles={['student']} />}>
        <Route element={<StudentShell />}>
          <Route path="/home" element={<StudentHomePage />} />
          <Route path="/home/mock-exams" element={<MockExamsPage />} />
          <Route path="/home/past-quizzes" element={<PastQuizzesPage />} />
          <Route path="/home/past-quizzes/:quizId" element={<StudentQuizDashboardPage />} />
          <Route path="/home/practice-tests" element={<PracticeTestsPage />} />
          <Route path="/home/quizzes/:quizId" element={<QuizDetailPage />} />
          {/* Goal-setup lives inline on the detail page itself (opened via
              ?goal=1), not a separate route — see StudyGoalPanel.tsx. */}
          <Route path="/home/practice-tests/:testId" element={<PracticeTestDetailPage />} />
          <Route path="/home/purchases" element={<MyPurchasesPage />} />
          <Route path="/home/wishlist" element={<WishlistPage />} />
          <Route path="/home/profile" element={<ProfilePage />} />
          <Route path="/home/settings" element={<SettingsPage />} />
          <Route path="/home/search" element={<SearchResultsPage />} />
          <Route path="/home/help" element={<HelpPage />} />
          <Route path="/home/cart" element={<CartPage />} />
        </Route>
        <Route path="/quizzes/:quizId/take" element={<QuizTakingPage />} />
        <Route path="/practice-tests/:testId/take" element={<PracticeTakingPage />} />
      </Route>

      <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
        <Route element={<AdminShell />}>
          <Route path="/admin" element={<AdminHomePage />} />
          <Route path="/admin/quizzes" element={<ExamQuizStudioPage />} />
          <Route path="/admin/quizzes/:quizId/view" element={<QuizAnswerKeyPage />} />
          <Route path="/admin/practice-tests" element={<PracticeManagerPage />} />
          <Route path="/admin/practice-tests/:testId/view" element={<PracticeTestAnswerKeyPage />} />
          <Route path="/admin/performance" element={<PerformancePage />} />
          <Route path="/admin/coupons" element={<CouponsPage />} />
          <Route path="/admin/users" element={<AdminUsersPage />} />
          <Route path="/admin/referrals" element={<AdminReferralAuditPage />} />
          <Route path="/admin/settings" element={<AdminSettingsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
