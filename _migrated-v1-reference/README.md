# v1 frontend pages — archived, not deleted

Moved out of `src/` (not just unrouted) on 2026-08-22 because `tsc -b` type-checks every file
under `src/` regardless of whether the router still imports it — with `src/types/api.ts` and
`src/features/auth/*` rewritten for the v2 (Quiz + Practice Test) product, these old pages no
longer type-check and would otherwise hard-fail `npm run build` even though nothing routes to them.

See `functions/src/_migrated-v1-reference/README.md` (one level up in the repo) for the full
story of what got replaced and why. Corresponding backend logic for these pages lived in that
folder's `admin-uploads.ts`, `enrollment.ts`, `exam-admin.ts`, `exam-session.ts`, `exam-results.ts`,
`questions.ts`, `analytics.ts`.

| Here | Was |
|---|---|
| `features/courses/` | Course catalog (list/detail) |
| `features/certificates/` | Certificate listing/verification UI |
| `features/exams/` | Course-scoped exam-taking session |
| `features/results/` | Course/exam results page |
| `features/analytics/` | Instructor/admin course analytics |
| `CreateCoursePage.tsx`, `CreateExamPage.tsx`, `DocumentUploadPage.tsx`, `AdminDashboardPage.tsx`, `uploadsApi.ts` | v1 admin/instructor tooling |
| `layout/Navbar.tsx`, `layout/AppLayout.tsx` | v1's single shared nav/layout — replaced by `components/layout/AdminShell.tsx` and `StudentShell.tsx` |
