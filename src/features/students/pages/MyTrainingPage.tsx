import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { myTrainingApi } from '@/features/trainer/api/trainerApi';
import { EmptyState } from '@/components/ui';

// "My Training" ("/home/my-training") - Phase 1A's whole learner-facing
// surface for Trainer / Mentored Learning: the programs a learner belongs
// to, their trainer, and the assigned reading list. Today's session,
// attendance history, progress percentage, and the Learner-Completed vs.
// Trainer-Verified skill tracker are Phase 1B/1C - not built here.
// Assigned content links into the existing quiz/practice-test detail
// pages unchanged - opening one still requires whatever entitlement the
// learner already needs today; being assigned here does not itself grant
// access.
export function MyTrainingPage() {
  const { data, isLoading } = useQuery({ queryKey: ['student', 'myTrainingPrograms'], queryFn: myTrainingApi.listMyMemberships });
  const programs = data?.programs ?? [];

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold text-ink">My Training</h1>
      <p className="mt-1 text-sm text-ink-faint">Training programs a trainer has added you to.</p>

      {isLoading && <p className="mt-6 text-sm text-ink-faint">Loading…</p>}
      {!isLoading && programs.length === 0 && (
        // Phase 0's audit flagged this page's empty state (a bare
        // sentence, no next action) among a few others across the app.
        // Membership here is trainer-assigned only (no self-serve join),
        // so the "next step" is explaining that rather than a browse
        // link - the closest genuinely useful action is Practice/Mock
        // Exams, which every learner can start on their own regardless.
        <EmptyState
          className="mt-6"
          title="You're not on any training program yet"
          hint="A trainer adds you to a program and assigns content - there's nothing to set up here yourself. In the meantime, you can still practice on your own."
          action={
            <Link to="/home/practice-tests" className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
              Browse Practice Exams
            </Link>
          }
        />
      )}

      <div className="mt-6 space-y-4">
        {programs.map((p) => (
          <div key={p.programId} className="rounded-xl border border-surface-border bg-surface-raised p-6">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-bold text-ink">{p.title}</h2>
                <p className="text-xs text-ink-faint">Trainer: {p.trainerName}</p>
              </div>
              {p.membershipStatus === 'INVITED' && (
                <span className="rounded-full border border-brand-500/40 bg-brand-500/10 px-2.5 py-0.5 text-xs font-medium text-brand-ink">
                  Invited
                </span>
              )}
              {p.programStatus === 'ARCHIVED' && (
                <span className="rounded-full border border-surface-border bg-surface px-2.5 py-0.5 text-xs text-ink-faint">
                  Archived
                </span>
              )}
            </div>
            {p.description && <p className="mt-2 text-sm text-ink-muted">{p.description}</p>}

            <h3 className="mb-2 mt-4 text-xs font-medium uppercase tracking-wide text-ink-faint">Assigned content</h3>
            {p.assignedContent.length === 0 ? (
              <p className="text-sm text-ink-faint">Nothing assigned yet.</p>
            ) : (
              <ul className="space-y-2">
                {p.assignedContent.map((c) => (
                  <li key={`${c.itemType}_${c.itemId}`}>
                    <Link
                      to={c.itemType === 'quiz' ? `/home/quizzes/${c.itemId}` : `/home/practice-tests/${c.itemId}`}
                      className="flex items-center justify-between rounded-lg border border-surface-border px-3 py-2 text-sm text-ink hover:border-brand-400"
                    >
                      <span>{c.title}</span>
                      <span className="text-xs text-ink-faint">{c.itemType === 'quiz' ? 'Mock Exam' : 'Practice Test'}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
