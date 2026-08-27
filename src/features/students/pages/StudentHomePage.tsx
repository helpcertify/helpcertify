import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { listAvailableQuizzes, listPracticeTestsBucketed } from '../api/studentContentApi';
import { cartApi } from '../api/cartApi';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { CourseCarousel, type CarouselItem } from '@/components/common/CourseCarousel';

// A time-of-day greeting reads as personal without needing any extra data
// collection: `new Date()` in the browser already reflects the learner's own
// local clock, which is the same signal a stored timezone field would give.
function timeOfDayGreeting(hour: number): string {
  if (hour < 5) return 'Still up studying';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Good night';
}

// The personalized "what to do right now" dashboard — deliberately kept to
// just the greeting/Continue Practice, Continue where you left off,
// Recommended for you, and Upcoming Mock Exams. The fuller activity/
// progress picture (Your Study Plan, My Exams, Performance Summary,
// Recommended Next Step, Recent Attempts) moved to My Profile on request
// (see ProfileActivitySections.tsx) — this page stays focused on today's
// next action instead of also being a full history/analytics view.
export function StudentHomePage() {
  const uid = useAuthStore((s) => s.firebaseUser?.uid);
  const profile = useAuthStore((s) => s.profile);

  const { data: quizzes } = useQuery({ queryKey: ['student', 'availableQuizzes'], queryFn: listAvailableQuizzes });
  const { data: practiceBuckets } = useQuery({ queryKey: ['student', 'practiceTests'], queryFn: listPracticeTestsBucketed });
  const { data: purchases } = useQuery({ queryKey: ['student', 'purchases'], queryFn: cartApi.listMyPurchases });

  const { data: myAttempts } = useQuery({
    queryKey: ['student', 'myQuizAttemptsFull', uid],
    queryFn: async () => {
      const snap = await getDocs(query(collection(db, 'quizAttempts'), where('userId', '==', uid)));
      return snap.docs.map((d) => {
        const data = d.data();
        return {
          quizId: data.quizId as string,
          status: data.status as string,
          answeredCount: (data.answeredCount as number) ?? 0,
          totalQuestions: (data.totalQuestions as number) ?? 0,
          startedAt: data.startedAt as { toMillis?: () => number } | undefined,
        };
      });
    },
    enabled: !!uid,
  });

  const { data: practiceProgressDocs } = useQuery({
    queryKey: ['student', 'practiceProgressFull', uid],
    queryFn: async () => {
      const snap = await getDocs(query(collection(db, 'practiceProgress'), where('userId', '==', uid)));
      return snap.docs.map((d) => {
        const data = d.data();
        return {
          testId: data.testId as string,
          answeredQuestionIds: (data.answeredQuestionIds as string[]) ?? [],
          updatedAt: data.updatedAt as { toMillis?: () => number } | undefined,
        };
      });
    },
    enabled: !!uid,
  });

  const purchasedSet = new Set((purchases?.purchases ?? []).map((p) => `${p.itemType}_${p.itemId}`));
  const quizById = new Map((quizzes ?? []).map((q) => [q.id, q]));
  const practiceTestById = new Map((practiceBuckets?.available ?? []).map((t) => [t.id, t]));
  const attemptByQuizId = new Map((myAttempts ?? []).map((a) => [a.quizId, a]));

  // Recommended for you — ranked by rating (falls back to catalog order
  // when nothing has a rating yet), capped to 10 on request. Pulls from both
  // quizzes (Mock Exams) and practice tests: an earlier version only looked
  // at quizzes, which silently hid this whole section for a student whose
  // platform mostly has published practice tests rather than quizzes (the
  // section renders nothing at all once its item list is empty, see
  // CourseCarousel). Not personalized in any real sense (no click/purchase
  // history feeds this), same honest "best of the catalog" signal used
  // everywhere else ratings show up.
  const recommended: CarouselItem[] = [
    ...(quizzes ?? []).map((q) => ({
      itemType: 'quiz' as const,
      id: q.id,
      title: q.title,
      category: q.category ?? 'Other',
      skillLevel: q.skillLevel ?? 'Foundation',
      price: q.price ?? 0,
      originalPrice: q.originalPrice ?? null,
      currency: q.currency ?? 'INR',
      ratingAvg: q.ratingAvg ?? 0,
      ratingCount: q.ratingCount ?? 0,
      totalQuestions: q.totalQuestions ?? 0,
    })),
    ...(practiceBuckets?.available ?? []).map((t) => ({
      itemType: 'practiceTest' as const,
      id: t.id,
      title: t.title,
      category: t.category ?? 'Other',
      skillLevel: t.skillLevel ?? 'Foundation',
      price: t.price ?? 0,
      originalPrice: t.originalPrice ?? null,
      currency: t.currency ?? 'INR',
      ratingAvg: t.ratingAvg ?? 0,
      ratingCount: t.ratingCount ?? 0,
      totalQuestions: t.totalQuestions ?? 0,
    })),
  ]
    .sort((a, b) => (b.ratingAvg ?? 0) * (b.ratingCount ?? 0) - (a.ratingAvg ?? 0) * (a.ratingCount ?? 0))
    .slice(0, 10);

  // Continue where you left off — the single most-recently-touched
  // in-progress item across both quizzes and practice tests.
  interface ContinueCandidate {
    title: string;
    category: string;
    answeredCount: number;
    totalQuestions: number;
    lastActivityMs: number;
    href: string;
  }
  const continueCandidates: ContinueCandidate[] = [];
  for (const a of myAttempts ?? []) {
    if (a.status !== 'in_progress') continue;
    const quiz = quizById.get(a.quizId);
    if (!quiz) continue;
    continueCandidates.push({
      title: quiz.title,
      category: quiz.category ?? 'Other',
      answeredCount: a.answeredCount,
      totalQuestions: a.totalQuestions || quiz.totalQuestions,
      lastActivityMs: a.startedAt?.toMillis?.() ?? 0,
      href: `/quizzes/${a.quizId}/take`,
    });
  }
  for (const p of practiceProgressDocs ?? []) {
    const test = practiceTestById.get(p.testId);
    if (!test) continue;
    const answered = p.answeredQuestionIds.length;
    if (answered === 0 || answered >= test.totalQuestions) continue;
    continueCandidates.push({
      title: test.title,
      category: test.category ?? 'Other',
      answeredCount: answered,
      totalQuestions: test.totalQuestions,
      lastActivityMs: p.updatedAt?.toMillis?.() ?? 0,
      href: `/practice-tests/${p.testId}/take`,
    });
  }
  continueCandidates.sort((a, b) => b.lastActivityMs - a.lastActivityMs);
  const continueItem = continueCandidates[0] ?? null;

  // Upcoming Mock Exams — owned quizzes not yet attempted at all.
  const upcomingMockExams = (quizzes ?? [])
    .filter((q) => ((q.price ?? 0) === 0 || purchasedSet.has(`quiz_${q.id}`)) && !attemptByQuizId.get(q.id))
    .slice(0, 4);

  return (
    <div>
      {/* Welcome and primary action — the subtitle restating what to
          continue was removed on request: it's redundant now that
          "Continue where you left off" sits right below with the same
          title front and center. */}
      <div className="mb-8">
        <h1 className="mb-4 text-2xl font-bold text-ink">
          {timeOfDayGreeting(new Date().getHours())}{profile?.name ? `, ${profile.name.split(' ')[0]}` : ''}.
        </h1>
        {continueItem && (
          <Link
            to={continueItem.href}
            className="inline-block rounded-lg bg-[#155EEF] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#004EEB]"
          >
            Continue Practice
          </Link>
        )}
      </div>

      {/* Continue where you left off — only shown while something is
          actually in progress (continueItem is null otherwise), so this
          heading never appears for a student who hasn't started anything
          yet. HelpCertify Electric Blue theme: soft blue gradient instead of
          the app's general brand-blue tint, matching the Recommended for
          You cards' own header gradient. */}
      {continueItem && (
        <div className="mb-8 rounded-xl border border-[#B9CEFF] bg-gradient-to-r from-[#EFF6FF] to-[#F8FAFF] p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-[#64748B]">Continue where you left off</h2>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-[#0F172A]">{continueItem.title}</div>
              <div className="text-xs text-[#64748B]">{continueItem.category}</div>
              <div className="mt-1 text-sm text-[#334155]">
                {Math.round((continueItem.answeredCount / (continueItem.totalQuestions || 1)) * 100)}% complete ·{' '}
                {continueItem.answeredCount}/{continueItem.totalQuestions} questions
              </div>
            </div>
            <Link
              to={continueItem.href}
              className="rounded-lg bg-[#155EEF] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#004EEB]"
            >
              Continue →
            </Link>
          </div>
        </div>
      )}

      {/* Recommended for you — moved directly below "Continue where you
          left off" on request. */}
      <CourseCarousel title="Recommended for you" items={recommended} />

      {/* Upcoming or incomplete Mock Exams */}
      {upcomingMockExams.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-lg font-bold text-ink">Upcoming Mock Exams</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {upcomingMockExams.map((q) => (
              <div key={q.id} className="flex h-full flex-col rounded-xl border border-surface-border border-t-4 border-t-blue-400 bg-surface-raised p-4">
                <div className="mb-1 line-clamp-2 font-semibold text-ink">{q.title}</div>
                <div className="mb-3 space-y-0.5 text-xs text-ink-faint">
                  <div>{q.totalQuestions} questions · {q.durationMinutes} min</div>
                  <div>Passing score: {q.passMarkPercent ?? 60}%</div>
                  <div>Attempts remaining: 1</div>
                </div>
                <Link
                  to={`/quizzes/${q.id}/take`}
                  className="mt-auto block rounded-lg bg-[#155EEF] py-1.5 text-center text-sm font-medium text-surface"
                >
                  Start Mock Exam
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
