import { useState } from 'react';
import { NavLink, Link, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import clsx from 'clsx';
import { authApi } from '@/features/auth/api/authApi';
import { Logo } from '@/components/brand/Logo';
import { db } from '@/lib/firebase';
import { cartApi } from '@/features/students/api/cartApi';
import { CartIcon, HeartIcon, BellIcon, SearchIcon } from '@/components/common/icons';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { useUiStore } from '@/store/useUiStore';
import { toDate, formatShortDate } from '@/utils/formatDate';
import { calendarDaysBetween } from '@/features/students/lib/studyPlan';
import type { StudyPlanDoc } from '@/types/models';

// "Exam Categories" used to be its own tab; its filtering moved inline onto
// the Practice Exams/Mock Exams pages themselves (see FilterBar) instead of
// sitting in the main nav. Billing & Orders (formerly "My Purchases") was
// briefly moved under My Profile, but moved back to its own tab on request
// so learners can reach their purchase history directly from the sidebar.
// The first tab (still routed to /home, the dashboard) is labeled "Learning
// Portal" rather than "Home" on request.
const NAV_ITEMS = [
  { to: '/home', label: 'Learning Portal', end: true },
  { to: '/home/practice-tests', label: 'Practice Exams' },
  { to: '/home/mock-exams', label: 'Mock Exams' },
  { to: '/home/past-quizzes', label: 'My Attempts' },
  { to: '/home/purchases', label: 'Billing & Orders' },
  { to: '/home/wishlist', label: 'Saved Items' },
];

// My Profile and Settings are account-level, not content tabs, so they're
// pinned on after NAV_ITEMS instead of mixed into it: Settings last, My
// Profile directly above it. Both are real routes now (My Profile used to
// open a modal — moved to its own page/route on request), so both get the
// same active-state NavLink styling for free.

// First name + last name initials for the header avatar ("Uma Mageshwari" ->
// "UM"), falling back to a single "?" for a profile that hasn't loaded yet
// or somehow has no name at all.
function initials(name?: string): string {
  if (!name?.trim()) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase() || '?';
}

// Matches the reference screenshots' "Learning Portal" student shell: a
// unified top header (brand, search, account-utility icons) that spans the
// full width at every breakpoint, with the actual nav living in a left
// sidebar (lg: and up) or a dropdown just under the header (mobile) — the
// header itself never carries nav links. No department/academic-year badges
// here — this platform isn't limited to students at an institution, so
// profile fields stay generic (name, email, avatar) rather than
// campus-specific.
export function StudentShell() {
  const navigate = useNavigate();
  const uid = useAuthStore((s) => s.firebaseUser?.uid);
  const profile = useAuthStore((s) => s.profile);
  const pushToast = useUiStore((s) => s.pushToast);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  // staleTime keeps this from refetching on every focus/route-change — the
  // count only actually changes from an add/remove/checkout, and those
  // mutations already invalidate this same query key themselves.
  const { data: cart } = useQuery({ queryKey: ['student', 'cart'], queryFn: cartApi.getCart, staleTime: 30_000 });
  const cartCount = cart?.items.length ?? 0;

  // The exam countdown(s) pinned above Sign Out, visible on every page —
  // only considers plans where the learner actually chose a target exam
  // date (Option A). A pace-mode plan's "suggested" exam date is a rolling
  // estimate, not a date the learner committed to, so it isn't a fitting
  // permanent reminder here (it's already shown on that plan's own card on
  // the Home dashboard). One card per exam GOAL, nearest first — a learner
  // preparing for more than one certification should see all of them, but
  // several practice tests covering the *same* certification (e.g. "CISA
  // Practice Test 1/2/3") must collapse into a single card, keyed on the
  // exam's own name + provider rather than on each test's id. A test's
  // `examName` (falling back to its `title` when unset) is the exam name;
  // `category` is already the existing certification-body/provider field.
  const { data: examCountdowns } = useQuery({
    queryKey: ['student', 'examCountdowns', uid],
    queryFn: async () => {
      const snap = await getDocs(query(collection(db, 'studyPlans'), where('userId', '==', uid)));
      const plans = snap.docs
        .map((d) => d.data() as StudyPlanDoc)
        .filter((p) => p.planningMode === 'examDate' && p.targetExamDate)
        .map((p) => ({ testId: p.testId, examDate: toDate(p.targetExamDate) }))
        .filter((p) => calendarDaysBetween(new Date(), p.examDate) >= 0);

      const withTestInfo = await Promise.all(
        plans.map(async (p) => {
          const testSnap = await getDoc(doc(db, 'practiceTests', p.testId));
          const data = testSnap.data();
          const title = (data?.title as string | undefined) ?? 'Untitled Practice Test';
          const examName = (data?.examName as string | undefined)?.trim() || title;
          const provider = (data?.category as string | undefined) ?? 'Other';
          return { ...p, examName, provider };
        })
      );

      const byGoal = new Map<string, (typeof withTestInfo)[number]>();
      for (const entry of withTestInfo) {
        const key = `${entry.examName}::${entry.provider}`;
        const existing = byGoal.get(key);
        if (!existing || entry.examDate < existing.examDate) byGoal.set(key, entry);
      }

      return [...byGoal.values()]
        .map((entry) => ({
          testId: entry.testId,
          examName: entry.examName,
          provider: entry.provider,
          examDate: entry.examDate,
          daysToExam: calendarDaysBetween(new Date(), entry.examDate),
        }))
        .sort((a, b) => a.daysToExam - b.daysToExam);
    },
    enabled: !!uid,
    staleTime: 5 * 60_000,
  });

  const handleSignOut = async () => {
    await authApi.logout();
    navigate('/login');
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const term = searchValue.trim();
    navigate(term ? `/home/search?q=${encodeURIComponent(term)}` : '/home/search');
  };

  // There's no notifications backend/collection anywhere in this data
  // model, so this is an honest "nothing to show yet" affordance rather
  // than a fabricated unread badge.
  const handleNotificationsClick = () => pushToast("You're all caught up. No new notifications yet.", 'info');

  // text-ink (not text-ink-muted) for the inactive state — real user
  // feedback that nav tab labels needed to read as solidly dark, not a
  // secondary/muted gray, to stay clearly visible.
  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    clsx('rounded-lg px-3 py-2 text-sm', isActive ? 'bg-[#E8F0FF] text-[#155EEF] font-medium' : 'text-ink hover:bg-white/5');

  const navLinks = (onNavigate: () => void) => (
    <>
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} onClick={onNavigate} className={navLinkClass}>
          {item.label}
        </NavLink>
      ))}
      <NavLink to="/home/profile" onClick={onNavigate} className={navLinkClass}>
        My Profile
      </NavLink>
      <NavLink to="/home/settings" onClick={onNavigate} className={navLinkClass}>
        Settings
      </NavLink>
    </>
  );

  return (
    <div className="min-h-screen bg-surface">
      {/* Unified header — logo, search, Help, Saved Items, Cart (amber
          count), Notifications, avatar. Fixed height (h-14) so the sidebar
          below can offset its own sticky position by an exact amount. */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-surface-border bg-surface px-4 lg:px-8">
        <button
          type="button"
          onClick={() => setMobileNavOpen((v) => !v)}
          aria-label="Toggle menu"
          className="shrink-0 rounded-lg border border-surface-border px-2.5 py-1.5 text-base text-ink-muted lg:hidden"
        >
          {mobileNavOpen ? '✕' : '☰'}
        </button>
        <Logo size="sm" className="shrink-0" />

        <form onSubmit={handleSearchSubmit} className="hidden min-w-0 flex-1 sm:block">
          <div className="relative mx-auto max-w-xl">
            <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Search certifications, exams and topics"
              aria-label="Search certifications, exams and topics"
              className="input-dark w-full rounded-full pl-9 pr-9"
            />
            {searchValue && (
              <button
                type="button"
                onClick={() => setSearchValue('')}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
              >
                ✕
              </button>
            )}
          </div>
        </form>

        <div className="ml-auto flex shrink-0 items-center gap-4">
          <Link to="/home/help" className="hidden text-sm font-medium text-ink-muted hover:text-ink sm:inline">
            Help
          </Link>
          <Link to="/home/wishlist" aria-label="Saved items" className="text-ink-muted hover:text-ink">
            <HeartIcon filled={false} className="h-5 w-5" />
          </Link>
          {/* Encircled in blue on request, rather than a bare icon like the
              other header buttons. */}
          <Link
            to="/home/cart"
            aria-label="Cart"
            className="relative flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#155EEF] text-[#155EEF] hover:bg-[#155EEF]/10"
          >
            <CartIcon className="h-4 w-4" />
            {cartCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#d87f1d] text-[10px] font-semibold text-white ring-2 ring-surface">
                {cartCount}
              </span>
            )}
          </Link>
          <button type="button" onClick={handleNotificationsClick} aria-label="Notifications" className="text-ink-muted hover:text-ink">
            <BellIcon className="h-5 w-5" />
          </button>
          <Link
            to="/home/profile"
            aria-label="My Profile"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#155EEF] text-xs font-semibold text-white"
          >
            {initials(profile?.name)}
          </Link>
        </div>
      </header>

      {/* Mobile nav dropdown — below lg: only, opened by the header's
          hamburger button. */}
      {mobileNavOpen && (
        <nav className="flex flex-col gap-1 border-b border-surface-border p-4 lg:hidden">
          {navLinks(() => setMobileNavOpen(false))}
          {examCountdowns && examCountdowns.length > 0 && (
            <div className="mt-2">
              <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Your Exams</div>
              <div className="flex flex-col gap-2">
                {examCountdowns.map((c) => (
                  <ExamCountdownCard key={c.testId} {...c} />
                ))}
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={handleSignOut}
            className="mt-2 rounded-lg border border-surface-border py-2 text-sm text-ink hover:border-red-500/50 hover:text-red-400"
          >
            Sign Out
          </button>
        </nav>
      )}

      <div className="lg:flex">
        {/* Desktop sidebar — lg: and up only, offset below the fixed-height
            header (top-14 / h-[calc(100vh-3.5rem)] both match h-14 above).
            Nav-only now; the brand mark moved up into the header so it
            isn't shown twice. Sign Out stays pinned at the bottom via
            mt-auto, same as before. */}
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 flex-col border-r border-surface-border p-6 lg:flex">
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">{navLinks(() => {})}</nav>
          <div className="mt-auto shrink-0">
            {examCountdowns && examCountdowns.length > 0 && (
              <div className="mb-3">
                <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Your Exams</div>
                <div className="flex flex-col gap-2">
                  {examCountdowns.map((c) => (
                    <ExamCountdownCard key={c.testId} {...c} />
                  ))}
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full rounded-lg border border-surface-border py-2 text-sm text-ink hover:border-red-500/50 hover:text-red-400"
            >
              Sign Out
            </button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <main className="p-4 lg:p-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

// One card per exam GOAL (not per practice test — see the dedup logic
// above), pinned above Sign Out on every page so a learner who committed
// to an exam date never has to go looking for it. The "Your Exams" section
// label above the stack already says what these are, so each card itself
// leads with the thing that actually differs between cards: the
// certification name.
function ExamCountdownCard({
  examName,
  provider,
  examDate,
  daysToExam,
  className = '',
}: {
  examName: string;
  provider: string;
  examDate: Date;
  daysToExam: number;
  testId?: string;
  className?: string;
}) {
  // Certification name is visually strongest (the one fact that
  // distinguishes cards from each other); provider is small/muted since
  // it's supporting context, not the headline. The countdown keeps the
  // flat dark amber (#D87F1D) requested for emphasis; the exam date itself
  // is small secondary text, same treatment as provider.
  return (
    <div className={`rounded-lg border border-[#FED7AA] bg-[#FFF7ED] px-3 py-2.5 ${className}`}>
      <div className="truncate text-base font-bold text-[#0F172A]" title={examName}>
        {examName}
      </div>
      <div className="mb-2 truncate text-xs text-[#64748B]">{provider}</div>
      <div className="text-lg font-bold text-[#D87F1D]">
        {daysToExam === 0 ? 'Exam is today' : `${daysToExam} Day${daysToExam === 1 ? '' : 's'} to Go`}
      </div>
      <div className="text-xs text-[#64748B]">{formatShortDate(examDate)}</div>
    </div>
  );
}
