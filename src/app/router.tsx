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
import { PerformancePage } from '@/features/admin/pages/PerformancePage';
import { StudentHomePage } from '@/features/students/pages/StudentHomePage';
import { PastQuizzesPage } from '@/features/students/pages/PastQuizzesPage';
import { StudentQuizDashboardPage } from '@/features/students/pages/StudentQuizDashboardPage';
import { PracticeTestsPage } from '@/features/students/pages/PracticeTestsPage';
import { QuizTakingPage } from '@/features/students/pages/QuizTakingPage';
import { PracticeTakingPage } from '@/features/students/pages/PracticeTakingPage';

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
          <Route path="/admin/performance" element={<PerformancePage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
