import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { cartApi } from '../api/cartApi';
import { getCourseById } from '../api/courseApi';
import { useCertificationCatalog } from '../api/certificationCatalogApi';
import { myTrainingApi } from '@/features/trainer/api/trainerApi';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { isPurchaseActive } from '../lib/purchaseAccess';
import { toDate } from '@/utils/formatDate';
import { Tabs, EmptyState } from '@/components/ui';
import { ProductCardShell } from '@/components/common/ProductCardShell';

type TabId = 'all' | 'courses' | 'examPrep' | 'training';

function formatDate(v: unknown): string {
  return v ? toDate(v).toLocaleDateString() : '-';
}

interface OwnedItem {
  itemType: 'quiz' | 'practiceTest';
  id: string;
  title: string;
  category: string;
  skillLevel: string;
  totalQuestions: number;
  ratingAvg: number;
  ratingCount: number;
  price: number;
  currency: 'INR' | 'USD';
  expiresAt: unknown;
}

interface OwnedCourse {
  id: string;
  title: string;
  category: string;
  skillLevel: string;
  ratingAvg: number;
  ratingCount: number;
  price: number;
  currency: 'INR' | 'USD';
  coverImageUrl: string | null;
}

// "My Learning" - the blueprint's Section 4 spec: "Tabs: All, Courses, Exam
// Prep, Assigned Training; owned status and access-until date. Start/
// Continue/Review; expired access shows renewal terms." This is content
// access, distinct from Billing & Orders (MyPurchasesPage), which stays the
// receipts/invoices view per the same spec's "Account pages" row. Training
// content here links into the full /home/my-training page rather than
// duplicating its own list rendering, to keep this page from becoming a
// second copy of the same logic.
export function MyLearningPage() {
  const uid = useAuthStore((s) => s.firebaseUser?.uid);
  const [tab, setTab] = useState<TabId>('all');

  const { data: purchases } = useQuery({ queryKey: ['student', 'purchases'], queryFn: cartApi.listMyPurchases });
  const { data: catalog } = useCertificationCatalog();
  const { data: training } = useQuery({ queryKey: ['student', 'myTrainingPrograms'], queryFn: myTrainingApi.listMyMemberships });

  const activePurchases = (purchases?.purchases ?? []).filter(isPurchaseActive);

  const { data: ownedItems, isLoading: itemsLoading } = useQuery({
    queryKey: ['student', 'myLearningItems', purchases?.purchases],
    queryFn: async (): Promise<OwnedItem[]> => {
      const list = activePurchases.filter(
        (p): p is typeof p & { itemType: 'quiz' | 'practiceTest' } => p.itemType === 'quiz' || p.itemType === 'practiceTest',
      );
      const results = await Promise.all(
        list.map(async (p) => {
          const collectionName = p.itemType === 'quiz' ? 'quizzes' : 'practiceTests';
          const snap = await getDoc(doc(db, collectionName, p.itemId));
          if (!snap.exists()) return null;
          const data = snap.data();
          return {
            itemType: p.itemType,
            id: p.itemId,
            title: data.title as string,
            category: (data.category as string) ?? 'Other',
            skillLevel: (data.skillLevel as string) ?? 'Foundation',
            totalQuestions: (data.totalQuestions as number) ?? 0,
            ratingAvg: (data.ratingAvg as number) ?? 0,
            ratingCount: (data.ratingCount as number) ?? 0,
            price: (data.price as number) ?? 0,
            currency: (data.currency as 'INR' | 'USD') ?? 'INR',
            expiresAt: (p.expiresAt ?? null) as unknown,
          } satisfies OwnedItem;
        }),
      );
      return results.filter((x): x is OwnedItem => x !== null);
    },
    enabled: !!purchases && !!uid,
  });

  const { data: ownedCourses } = useQuery({
    queryKey: ['student', 'myLearningCourses', purchases?.purchases],
    queryFn: async (): Promise<OwnedCourse[]> => {
      const list = activePurchases.filter((p) => p.itemType === 'course');
      const results = await Promise.all(
        list.map(async (p) => {
          const course = await getCourseById(p.itemId);
          if (!course) return null;
          return {
            id: course.id,
            title: course.title,
            category: course.category as string,
            skillLevel: course.skillLevel as string,
            ratingAvg: course.ratingAvg ?? 0,
            ratingCount: course.ratingCount ?? 0,
            price: course.price ?? 0,
            currency: (course.currency as 'INR' | 'USD') ?? 'INR',
            coverImageUrl: course.coverImageUrl,
          } satisfies OwnedCourse;
        }),
      );
      return results.filter((x): x is OwnedCourse => x !== null);
    },
    enabled: !!purchases && !!uid,
  });

  // item id -> certification name, same join MyPurchasesPage uses.
  const certNameById = new Map<string, string>();
  for (const cert of catalog?.certifications ?? []) {
    for (const pkg of cert.packages) {
      for (const id of pkg.includedPracticeTestIds) certNameById.set(id, cert.name);
      for (const id of pkg.includedQuizIds) certNameById.set(id, cert.name);
    }
  }
  const grouped = new Map<string, OwnedItem[]>();
  const ungrouped: OwnedItem[] = [];
  for (const it of ownedItems ?? []) {
    const certName = certNameById.get(it.id);
    if (certName) {
      const g = grouped.get(certName) ?? [];
      g.push(it);
      grouped.set(certName, g);
    } else {
      ungrouped.push(it);
    }
  }

  const activeTraining = (training?.programs ?? []).filter((p) => p.membershipStatus !== 'REMOVED');

  const hasAnything =
    (ownedItems?.length ?? 0) > 0 || (ownedCourses?.length ?? 0) > 0 || activeTraining.length > 0;

  const showExamPrep = tab === 'all' || tab === 'examPrep';
  const showCourses = tab === 'all' || tab === 'courses';
  const showTraining = tab === 'all' || tab === 'training';

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-ink">My Learning</h1>
      <p className="mb-4 text-sm text-ink-faint">Everything you own or have been assigned, in one place.</p>

      <Tabs
        className="mb-6"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'all', label: 'All' },
          { id: 'courses', label: 'Courses' },
          { id: 'examPrep', label: 'Exam Prep' },
          { id: 'training', label: 'Assigned Training' },
        ]}
      />

      {itemsLoading ? (
        <p className="text-sm text-ink-faint">Loading…</p>
      ) : !hasAnything ? (
        <EmptyState
          title="Nothing here yet"
          hint="Once you buy or start something free, it shows up here so you can pick up right where you left off."
          action={
            <div className="flex flex-wrap gap-3">
              <Link to="/home/courses" className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
                Explore Courses
              </Link>
              <Link to="/home/practice-tests" className="rounded-lg border border-brand-500 px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-brand-500/10">
                Explore Exam Prep
              </Link>
            </div>
          }
        />
      ) : (
        <div className="space-y-8">
          {showExamPrep && (grouped.size > 0 || ungrouped.length > 0) && (
            <section>
              {tab === 'all' && <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-faint">Exam Prep</h2>}
              <div className="space-y-4">
                {[...grouped.entries()].map(([certName, groupItems]) => {
                  const practiceCount = groupItems.filter((i) => i.itemType === 'practiceTest').length;
                  const mockCount = groupItems.filter((i) => i.itemType === 'quiz').length;
                  const withExpiry = groupItems.find((i) => i.expiresAt != null);
                  const expired = withExpiry && toDate(withExpiry.expiresAt).getTime() < Date.now();
                  return (
                    <div key={certName} className="rounded-xl border border-brand-500/30 bg-surface-raised p-5 shadow-card">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h3 className="text-base font-bold text-brand-ink">{certName}</h3>
                        {withExpiry && (
                          <span className={`text-xs ${expired ? 'font-semibold text-warning' : 'text-ink-faint'}`}>
                            {expired ? `Access expired ${formatDate(withExpiry.expiresAt)}` : `Access until ${formatDate(withExpiry.expiresAt)}`}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-ink-faint">
                        {practiceCount > 0 && `${practiceCount} practice exam${practiceCount === 1 ? '' : 's'}`}
                        {practiceCount > 0 && mockCount > 0 && ' · '}
                        {mockCount > 0 && `${mockCount} mock exam${mockCount === 1 ? '' : 's'}`}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {practiceCount > 0 && (
                          <Link to="/home/practice-tests" className="rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-600">
                            {expired ? 'View renewal options' : 'Continue Practice →'}
                          </Link>
                        )}
                        {mockCount > 0 && (
                          <Link to="/home/mock-exams" className="rounded-lg border border-brand-500 px-4 py-1.5 text-sm font-semibold text-brand-ink hover:bg-brand-500/10">
                            {expired ? 'View renewal options' : 'Continue Mock Exams →'}
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
                {ungrouped.length > 0 && (
                  <div className="flex flex-wrap gap-4">
                    {ungrouped.map((item) => {
                      const detailHref = item.itemType === 'quiz' ? `/home/quizzes/${item.id}` : `/home/practice-tests/${item.id}`;
                      return (
                        <ProductCardShell
                          key={`${item.itemType}_${item.id}`}
                          id={item.id}
                          itemType={item.itemType}
                          title={item.title}
                          category={item.category}
                          skillLevel={item.skillLevel}
                          ratingAvg={item.ratingAvg}
                          ratingCount={item.ratingCount}
                          price={item.price}
                          originalPrice={null}
                          currency={item.currency}
                          detailHref={detailHref}
                          footer={
                            <Link to={detailHref} className="block rounded-lg bg-brand-500 py-1.5 text-center text-sm font-semibold text-white hover:bg-brand-600">
                              Continue →
                            </Link>
                          }
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          )}

          {showCourses && (ownedCourses?.length ?? 0) > 0 && (
            <section>
              {tab === 'all' && <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-faint">Courses</h2>}
              <div className="flex flex-wrap gap-4">
                {ownedCourses!.map((course) => (
                  <ProductCardShell
                    key={`course_${course.id}`}
                    id={course.id}
                    itemType="course"
                    title={course.title}
                    category={course.category}
                    skillLevel={course.skillLevel}
                    ratingAvg={course.ratingAvg}
                    ratingCount={course.ratingCount}
                    price={course.price}
                    originalPrice={null}
                    currency={course.currency}
                    coverImageUrl={course.coverImageUrl}
                    detailHref={`/home/courses/${course.id}`}
                    footer={
                      <Link to={`/home/courses/${course.id}`} className="block rounded-lg bg-brand-500 py-1.5 text-center text-sm font-semibold text-white hover:bg-brand-600">
                        Continue Reading →
                      </Link>
                    }
                  />
                ))}
              </div>
            </section>
          )}

          {showTraining && activeTraining.length > 0 && (
            <section>
              {tab === 'all' && <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-faint">Assigned Training</h2>}
              <div className="space-y-3">
                {activeTraining.map((p) => (
                  <Link
                    key={p.programId}
                    to="/home/my-training"
                    className="block rounded-xl border border-surface-border bg-surface-raised p-4 hover:border-brand-400"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="font-bold text-ink">{p.title}</h3>
                        <p className="text-xs text-ink-faint">Trainer: {p.trainerName} · {p.assignedContent.length} assigned</p>
                      </div>
                      <span className="text-sm font-semibold text-brand-ink">Open →</span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {tab === 'courses' && (ownedCourses?.length ?? 0) === 0 && (
            <EmptyState
              title="No courses yet"
              hint="Courses you buy or start free show up here."
              action={
                <Link to="/home/courses" className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
                  Explore Courses
                </Link>
              }
            />
          )}
          {tab === 'examPrep' && grouped.size === 0 && ungrouped.length === 0 && (
            <EmptyState
              title="No Exam Prep yet"
              hint="Practice questions and mock exams you own show up here."
              action={
                <Link to="/home/practice-tests" className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
                  Explore Exam Prep
                </Link>
              }
            />
          )}
          {tab === 'training' && activeTraining.length === 0 && (
            <EmptyState
              title="No assigned training"
              hint="A trainer adds you to a program and assigns content - there's nothing to set up here yourself."
            />
          )}
        </div>
      )}
    </div>
  );
}
