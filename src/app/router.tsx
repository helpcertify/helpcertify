import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { AdminShell } from '@/components/layout/AdminShell';
import { StudentShell } from '@/components/layout/StudentShell';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { RegisterPage } from '@/features/auth/pages/RegisterPage';
import { ForgotPasswordPage } from '@/features/auth/pages/ForgotPasswordPage';
import { ResetPasswordPage } from '@/features/auth/pages/ResetPasswordPage';
import { VerifyEmailPage } from '@/features/auth/pages/VerifyEmailPage';
import { LandingPage } from '@/features/landing/pages/LandingPage';
import { AboutPage } from '@/features/marketing/pages/AboutPage';
import { ContactPage } from '@/features/marketing/pages/ContactPage';
import { PrivacyPage } from '@/features/marketing/pages/PrivacyPage';
import { TermsPage } from '@/features/marketing/pages/TermsPage';
import { RefundPage } from '@/features/marketing/pages/RefundPage';
import { SupportPage } from '@/features/marketing/pages/SupportPage';
import { DisclaimerPage } from '@/features/marketing/pages/DisclaimerPage';
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
import { MyCertificatesPage } from '@/features/students/pages/MyCertificatesPage';
import { VerifyCertificatePage } from '@/features/students/pages/VerifyCertificatePage';
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
import { ProductsPricingPage } from '@/features/admin/pages/ProductsPricingPage';
import { CertificationEditorPage } from '@/features/admin/pages/CertificationEditorPage';
import { PartnerApplicationsPage } from '@/features/admin/pages/PartnerApplicationsPage';
import { PayoutsPage } from '@/features/admin/pages/PayoutsPage';
import { BecomePartnerPage } from '@/features/partner/pages/BecomePartnerPage';
import { PartnerDashboardPage } from '@/features/partner/pages/PartnerDashboardPage';

// v2 route map (Quiz + Practice Test platform). Replaced the v1
// course/exam/certificate routes on 2026-08-22 - see
// functions/src/_migrated-v1-reference/README.md for what this replaced.
export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
      </Route>
      <Route path="/about" element={<AboutPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/refund" element={<RefundPage />} />
      <Route path="/support" element={<SupportPage />} />
      <Route path="/disclaimer" element={<DisclaimerPage />} />
      {/* Public certificate verification - no login required, matching how
          a real credential-verification page works for a third party
          checking a certificate a learner shared with them. */}
      <Route path="/verify/:certificateId" element={<VerifyCertificatePage />} />

      <Route element={<ProtectedRoute allowedRoles={['student']} />}>
        <Route element={<StudentShell />}>
          <Route path="/home" element={<StudentHomePage />} />
          <Route path="/home/mock-exams" element={<MockExamsPage />} />
          <Route path="/home/past-quizzes" element={<PastQuizzesPage />} />
          <Route path="/home/past-quizzes/:quizId" element={<StudentQuizDashboardPage />} />
          <Route path="/home/certificates" element={<MyCertificatesPage />} />
          <Route path="/home/practice-tests" element={<PracticeTestsPage />} />
          <Route path="/home/quizzes/:quizId" element={<QuizDetailPage />} />
          {/* Goal-setup lives inline on the detail page itself (opened via
              ?goal=1), not a separate route - see StudyGoalPanel.tsx. */}
          <Route path="/home/practice-tests/:testId" element={<PracticeTestDetailPage />} />
          <Route path="/home/purchases" element={<MyPurchasesPage />} />
          <Route path="/home/wishlist" element={<WishlistPage />} />
          <Route path="/home/profile" element={<ProfilePage />} />
          <Route path="/home/settings" element={<SettingsPage />} />
          <Route path="/home/search" element={<SearchResultsPage />} />
          <Route path="/home/help" element={<HelpPage />} />
          <Route path="/home/become-a-partner" element={<BecomePartnerPage />} />
          <Route path="/home/partner" element={<PartnerDashboardPage />} />
          <Route path="/home/cart" element={<CartPage />} />
        </Route>
        <Route path="/quizzes/:quizId/take" element={<QuizTakingPage />} />
        <Route path="/practice-tests/:testId/take" element={<PracticeTakingPage />} />
      </Route>

      {/* finance_admin is a limited staff role: it reaches the admin shell
          but only the Partner Payouts screen (AdminHomePage itself bounces
          it straight there). Everything else stays admin-only below. */}
      <Route element={<ProtectedRoute allowedRoles={['admin', 'finance_admin']} />}>
        <Route element={<AdminShell />}>
          <Route path="/admin" element={<AdminHomePage />} />
          <Route path="/admin/payouts" element={<PayoutsPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
        <Route element={<AdminShell />}>
          <Route path="/admin/products" element={<ProductsPricingPage />} />
          <Route path="/admin/products/new" element={<CertificationEditorPage />} />
          <Route path="/admin/products/:certificationId" element={<CertificationEditorPage />} />
          <Route path="/admin/quizzes" element={<ExamQuizStudioPage />} />
          <Route path="/admin/quizzes/:quizId/view" element={<QuizAnswerKeyPage />} />
          <Route path="/admin/practice-tests" element={<PracticeManagerPage />} />
          <Route path="/admin/practice-tests/:testId/view" element={<PracticeTestAnswerKeyPage />} />
          <Route path="/admin/performance" element={<PerformancePage />} />
          <Route path="/admin/coupons" element={<CouponsPage />} />
          <Route path="/admin/users" element={<AdminUsersPage />} />
          <Route path="/admin/referrals" element={<AdminReferralAuditPage />} />
          <Route path="/admin/partners" element={<PartnerApplicationsPage />} />
          <Route path="/admin/settings" element={<AdminSettingsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
