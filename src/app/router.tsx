import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { AdminShell } from '@/components/layout/AdminShell';
import { StudentShell } from '@/components/layout/StudentShell';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { RegisterPage } from '@/features/auth/pages/RegisterPage';
import { LandingPage } from '@/features/landing/pages/LandingPage';
import { LegalPlaceholderPage } from '@/features/landing/pages/LegalPlaceholderPage';
import { AdminHomePage } from '@/features/admin/pages/AdminHomePage';
import { ExamQuizStudioPage } from '@/features/admin/pages/ExamQuizStudioPage';
import { QuizAnswerKeyPage } from '@/features/admin/pages/QuizAnswerKeyPage';
import { PracticeManagerPage } from '@/features/admin/pages/PracticeManagerPage';
import { PracticeTestAnswerKeyPage } from '@/features/admin/pages/PracticeTestAnswerKeyPage';
import { PerformancePage } from '@/features/admin/pages/PerformancePage';
import { StudentHomePage } from '@/features/students/pages/StudentHomePage';
import { PastQuizzesPage } from '@/features/students/pages/PastQuizzesPage';
import { StudentQuizDashboardPage } from '@/features/students/pages/StudentQuizDashboardPage';
import { PracticeTestsPage } from '@/features/students/pages/PracticeTestsPage';
import { QuizDetailPage } from '@/features/students/pages/QuizDetailPage';
import { PracticeTestDetailPage } from '@/features/students/pages/PracticeTestDetailPage';
import { QuizTakingPage } from '@/features/students/pages/QuizTakingPage';
import { PracticeTakingPage } from '@/features/students/pages/PracticeTakingPage';
import { CartPage } from '@/features/students/pages/CartPage';
import { CategoriesPage } from '@/features/students/pages/CategoriesPage';
import { MyPurchasesPage } from '@/features/students/pages/MyPurchasesPage';
import { WishlistPage } from '@/features/students/pages/WishlistPage';
import { SettingsPage } from '@/features/students/pages/SettingsPage';
import { CouponsPage } from '@/features/admin/pages/CouponsPage';

// v2 route map (Quiz + Practice Test platform). Replaced the v1
// course/exam/certificate routes on 2026-08-22 — see
// functions/src/_migrated-v1-reference/README.md for what this replaced.
export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/privacy" element={<LegalPlaceholderPage title="Privacy Policy" />} />
      <Route path="/terms" element={<LegalPlaceholderPage title="Terms of Service" />} />

      <Route element={<ProtectedRoute allowedRoles={['student']} />}>
        <Route element={<StudentShell />}>
          <Route path="/home" element={<StudentHomePage />} />
          <Route path="/home/past-quizzes" element={<PastQuizzesPage />} />
          <Route path="/home/past-quizzes/:quizId" element={<StudentQuizDashboardPage />} />
          <Route path="/home/practice-tests" element={<PracticeTestsPage />} />
          <Route path="/home/quizzes/:quizId" element={<QuizDetailPage />} />
          <Route path="/home/practice-tests/:testId" element={<PracticeTestDetailPage />} />
          <Route path="/home/categories" element={<CategoriesPage />} />
          <Route path="/home/purchases" element={<MyPurchasesPage />} />
          <Route path="/home/wishlist" element={<WishlistPage />} />
          <Route path="/home/settings" element={<SettingsPage />} />
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
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
