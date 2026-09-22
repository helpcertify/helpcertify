import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { listAvailableQuizzes, listPracticeTestsBucketed } from '../api/studentContentApi';
import { cartApi } from '../api/cartApi';
import { useCertificationCatalog, type CatalogCertification } from '../api/certificationCatalogApi';
import { activePurchaseKeys } from '../lib/purchaseAccess';
import { useMyQuizAttempts } from '../hooks/useMyQuizAttempts';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { toDate } from '@/utils/formatDate';
import { calendarDaysBetween } from '../lib/studyPlan';
import { StudyPlanSection, type StudyPlanCardData } from './StudyPlanSection';
import type { StudyPlanDoc } from '@/types/models';

const EXPIRY_WARNING_DAYS = 7;

// My Profile's "Your Learning Journey" + "My Exams" - the identity+goal+
// exams-owned picture the new HelpCertify design system scopes this page
// to. Performance Summary / Recommended Next Step / Recent Attempts (which
// used to live here) are dropped: they don't appear in the new Profile
// page's structure, and that attempt history/scoring is still reachable
// from My Attempts, so nothing is actually lost - just no longer
// duplicated on this page. Self-sufficient (its own queries) rather than
// taking props from ProfilePage, so it works regardless of which page
// renders it.
export function ProfileActivitySections() {
  const uid = useAuthStore((s) => s.firebaseUser?.uid);

  const { data: catalog } = useCertificationCatalog();
  const { data: quizzes } = useQuery({ queryKey: ['student', 'availableQuizzes'], queryFn: listAvailableQuizzes });
  const { data: practiceBuckets } = useQuery({ queryKey: ['student', 'practiceTests'], queryFn: listPracticeTestsBucketed });
  const { data: purchases } = useQuery({ queryKey: ['student', 'purchases'], queryFn: cartApi.listMyPurchases });

  const { data: myAttempts } = useMyQuizAttempts();

  const { data: practiceProgressDocs } = useQuery({
    queryKey: ['student', 'practiceProgressFull', uid],
    queryFn: async () => {
      const snap = await getDocs(query(collection(db, 'practiceProgress'), where('userId', '==', uid)));
      return snap.docs.map((d) => {
        const data = d.data();
        return { testId: data.testId as string, answeredQuestionIds: (data.answeredQuestionIds as string[]) ?? [] };
      });
    },
    enabled: !!uid,
  });

  const { data: studyPlans } = useQuery({
    queryKey: ['student', 'studyPlans', uid],
    queryFn: async () => {
      const snap = await getDocs(query(collection(db, 'studyPlans'), where('userId', '==', uid)));
      return snap.docs.map((d) => d.data() as StudyPlanDoc);
    },
    enabled: !!uid,
  });

  const purchasedSet = activePurchaseKeys(purchases?.purchases);
  const practiceTestById = new Map((practiceBuckets?.available ?? []).map((t) => [t.id, t]));
  const attemptByQuizId = new Map((myAttempts ?? []).map((a) => [a.quizId, a]));

  // Your Learning Journey - one card per practice test with an active plan,
  // built entirely from data already fetched above (studyPlans + the test's
  // own record + this learner's unique-answered progress). See
  // StudyPlanSection for the actual calculations and rendering.
  const studyPlanCards: StudyPlanCardData[] = (studyPlans ?? [])
    .map((plan): StudyPlanCardData | null => {
      const test = practiceTestById.get(plan.testId);
      if (!test) return null;
      const uniqueAnsweredCount = (practiceProgressDocs ?? []).find((p) => p.testId === plan.testId)?.answeredQuestionIds.length ?? 0;
      return {
        testId: plan.testId,
        testTitle: test.title,
        testCategory: test.category ?? 'Other',
        totalQuestions: test.totalQuestions,
        minutesPerQuestion: test.defaultMinutesPerQuestion ?? 1.8,
        uniqueAnsweredCount,
        plan,
      };
    })
    .filter((c): c is StudyPlanCardData => c !== null);

  // A single nudge (not one per test) toward the goal-setup flow for a
  // learner who owns a practice test but hasn't set any plan at all yet.
  const plannedTestIds = new Set(studyPlanCards.map((c) => c.testId));
  const unplannedTest = (practiceBuckets?.available ?? []).find(
    (t) =>
      t.studyPlannerEnabled !== false &&
      !plannedTestIds.has(t.id) &&
      (((t.price ?? 0) === 0 && !t.requiresEntitlement) || purchasedSet.has(`practiceTest_${t.id}`))
  );

  // My Exams - everything owned (free or purchased), grouped one card per
  // certification below (item 11: "not individual practice tests or mock
  // tests, course/module/section wise") rather than one flat card per
  // quiz/practice test. `itemType` distinguishes a mock exam (quiz) from a
  // practice set (practiceTest) within a group; `certKey` is the raw item id
  // looked up against the catalog's own package contents, same convention
  // MyPurchasesPage's certNameById uses.
  interface OwnedItem {
    itemType: 'quiz' | 'practiceTest';
    id: string;
    title: string;
    category: string;
    totalQuestions: number;
    answered: number;
    percentComplete: number;
    expiryLabel: string | null;
    expiryWarningDays: number | null;
    detailHref: string;
    actionHref: string;
    actionLabel: string;
  }
  const ownedItems: OwnedItem[] = [];
  for (const q of quizzes ?? []) {
    // price === 0 alone doesn't mean "free": a series batch sold only
    // inside a certification package is also price: 0, gated instead by
    // requiresEntitlement (see api/quiz-session.ts's startAttempt, which
    // checks the same combination) - without that check here, an
    // unpurchased package's mock exams were showing as already owned.
    const isActuallyFree = (q.price ?? 0) === 0 && !q.requiresEntitlement;
    if (!(isActuallyFree || purchasedSet.has(`quiz_${q.id}`))) continue;
    const attempt = attemptByQuizId.get(q.id);
    const totalQuestions = attempt?.totalQuestions || q.totalQuestions;
    const answered = attempt?.answeredCount ?? 0;
    ownedItems.push({
      itemType: 'quiz',
      id: q.id,
      title: q.title,
      category: q.category ?? 'Other',
      totalQuestions,
      answered,
      percentComplete: totalQuestions > 0 ? Math.round((answered / totalQuestions) * 100) : 0,
      expiryLabel: null, // quizzes have no availability window in this data model
      expiryWarningDays: null,
      detailHref: `/home/quizzes/${q.id}`,
      actionHref: attempt && attempt.status !== 'in_progress' ? `/home/past-quizzes/${q.id}` : `/quizzes/${q.id}/take`,
      actionLabel: attempt?.status === 'in_progress' ? 'Resume' : attempt ? 'Review Performance' : 'Start Mock Exam',
    });
  }
  for (const t of practiceBuckets?.available ?? []) {
    // Same reasoning as the quiz loop above - price 0 does not mean free
    // when requiresEntitlement is set.
    const isActuallyFree = (t.price ?? 0) === 0 && !t.requiresEntitlement;
    if (!(isActuallyFree || purchasedSet.has(`practiceTest_${t.id}`))) continue;
    const progress = (practiceProgressDocs ?? []).find((p) => p.testId === t.id);
    const answered = progress?.answeredQuestionIds.length ?? 0;
    const done = answered >= t.totalQuestions;
    const daysUntilExpiry = calendarDaysBetween(new Date(), toDate(t.availableUntil));
    ownedItems.push({
      itemType: 'practiceTest',
      id: t.id,
      title: t.title,
      category: t.category ?? 'Other',
      totalQuestions: t.totalQuestions,
      answered,
      percentComplete: t.totalQuestions > 0 ? Math.round((answered / t.totalQuestions) * 100) : 0,
      expiryLabel: toDate(t.availableUntil).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }),
      expiryWarningDays: daysUntilExpiry >= 0 && daysUntilExpiry <= EXPIRY_WARNING_DAYS ? daysUntilExpiry : null,
      detailHref: `/home/practice-tests/${t.id}`,
      actionHref: done ? `/home/practice-tests/${t.id}` : `/practice-tests/${t.id}/take`,
      actionLabel: done ? 'Review Performance' : answered > 0 ? 'Continue Practice' : 'Start Practice',
    });
  }

  // Group owned items by certification (same item-id -> cert lookup
  // MyPurchasesPage's certNameById uses, built here against the fuller
  // CatalogCertification so the group card can link straight into that
  // certification's practice/mock series detail page). An item that isn't
  // part of any published certification package (a standalone free quiz,
  // say) falls back to its own card, same as before.
  const certByItemId = new Map<string, CatalogCertification>();
  for (const cert of catalog?.certifications ?? []) {
    for (const pkg of cert.packages) {
      for (const id of pkg.includedPracticeTestIds) certByItemId.set(id, cert);
      for (const id of pkg.includedQuizIds) certByItemId.set(id, cert);
    }
  }

  const groupedByCert = new Map<string, { cert: CatalogCertification; items: OwnedItem[] }>();
  const ungroupedItems: OwnedItem[] = [];
  for (const item of ownedItems) {
    const cert = certByItemId.get(item.id);
    if (!cert) {
      ungroupedItems.push(item);
      continue;
    }
    const g = groupedByCert.get(cert.id) ?? { cert, items: [] };
    g.items.push(item);
    groupedByCert.set(cert.id, g);
  }

  return (
    <div className="mt-6">
      <StudyPlanSection cards={studyPlanCards} unplannedTest={unplannedTest ? { id: unplannedTest.id, title: unplannedTest.title } : null} />

      {ownedItems.length > 0 && (
        <div>
          <h2 className="mb-3 text-[15px] font-bold uppercase tracking-wide text-brand-ink">My Exams</h2>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {[...groupedByCert.values()].map(({ cert, items: groupItems }) => {
              const practiceCount = groupItems.filter((i) => i.itemType === 'practiceTest').length;
              const mockCount = groupItems.filter((i) => i.itemType === 'quiz').length;
              const totalQuestions = groupItems.reduce((s, i) => s + i.totalQuestions, 0);
              const answered = groupItems.reduce((s, i) => s + i.answered, 0);
              const percentComplete = totalQuestions > 0 ? Math.round((answered / totalQuestions) * 100) : 0;
              const withExpiry = groupItems.find((i) => i.expiryLabel != null);
              const practiceHref = cert.seriesId ? `/home/practice-tests/series/${cert.seriesId}` : '/home/practice-tests';
              const mockHref = cert.seriesId ? `/home/mock-exams/series/${cert.seriesId}` : '/home/mock-exams';
              return (
                <div key={cert.id} className="flex flex-col rounded-xl border border-brand-500/30 bg-surface-raised p-6 shadow-card">
                  <div className="mb-1 text-base font-bold text-brand-ink">{cert.name}</div>
                  <div className="mb-4 text-xs text-ink-faint">
                    {practiceCount > 0 && `${practiceCount} practice set${practiceCount === 1 ? '' : 's'}`}
                    {practiceCount > 0 && mockCount > 0 && ' · '}
                    {mockCount > 0 && `${mockCount} mock exam${mockCount === 1 ? '' : 's'}`}
                  </div>

                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-ink">
                      {answered.toLocaleString()} / {totalQuestions.toLocaleString()} Questions
                    </span>
                    <span className="font-semibold text-ink">{percentComplete}% Complete</span>
                  </div>
                  <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, percentComplete)}%` }} />
                  </div>

                  <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
                    {withExpiry ? (
                      withExpiry.expiryWarningDays !== null ? (
                        <span className="text-xs font-medium text-warning">
                          ⚠ Access expires in {withExpiry.expiryWarningDays} day{withExpiry.expiryWarningDays === 1 ? '' : 's'}
                        </span>
                      ) : (
                        <span className="text-xs text-ink-faint">Access until {withExpiry.expiryLabel}</span>
                      )
                    ) : (
                      <span className="text-xs text-ink-faint">No expiry</span>
                    )}
                    <div className="flex gap-2">
                      {practiceCount > 0 && (
                        <Link
                          to={practiceHref}
                          className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-600"
                        >
                          Practice →
                        </Link>
                      )}
                      {mockCount > 0 && (
                        <Link
                          to={mockHref}
                          className="rounded-lg border border-brand-500 px-3 py-1.5 text-sm font-semibold text-brand-ink hover:bg-brand-500/10"
                        >
                          Mock →
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {ungroupedItems.map((item) => (
              <div
                key={item.detailHref}
                className="flex flex-col rounded-xl border border-surface-border bg-surface-raised p-6 shadow-card"
              >
                <Link to={item.detailHref} className="hover:text-brand-ink">
                  <div className="mb-1 line-clamp-2 text-base font-bold text-ink">📋 {item.title}</div>
                </Link>
                <div className="mb-4 text-xs text-ink-faint">{item.category}</div>

                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-ink">
                    {item.answered} / {item.totalQuestions} Questions
                  </span>
                  <span className="font-semibold text-ink">{item.percentComplete}% Complete</span>
                </div>
                <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, item.percentComplete)}%` }} />
                </div>

                <div className="mt-auto flex items-center justify-between gap-3">
                  {item.expiryLabel ? (
                    item.expiryWarningDays !== null ? (
                      <span className="text-xs font-medium text-warning">
                        ⚠ Access expires in {item.expiryWarningDays} day{item.expiryWarningDays === 1 ? '' : 's'}
                      </span>
                    ) : (
                      <span className="text-xs text-ink-faint">Access until {item.expiryLabel}</span>
                    )
                  ) : (
                    <span className="text-xs text-ink-faint">No expiry</span>
                  )}
                  <Link
                    to={item.actionHref}
                    className="shrink-0 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
                  >
                    {item.actionLabel} →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
