import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { useUiStore } from '@/store/useUiStore';
import { errorText } from '@/lib/errorMessages';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { listAvailableQuizzes, listPracticeTestsBucketed } from '@/features/students/api/studentContentApi';
import { trainerApi, listProgramLearners, type TrainingProgramSummary } from '../api/trainerApi';
import { CatalogSubmissionForm } from '@/features/catalogSubmissions/components/CatalogSubmissionForm';

// Trainer Workspace ("/home/trainer") - Phase 1A: create a training
// program, add learners by email, and assign existing HelpCertify quizzes/
// practice tests as reading-list content. Session scheduling, attendance,
// assignments, and the Learner-Completed-vs-Trainer-Verified skill tracker
// are Phase 1B/1C - not built here. Only reachable in practice by an
// account with profile.trainerId set (StudentShell's nav item is
// conditional on it); the fallback message below covers direct navigation
// by anyone else, since every server action re-checks trainer status
// itself regardless of what this page shows.
export function TrainerWorkspacePage() {
  const profile = useAuthStore((s) => s.profile);
  const pushToast = useUiStore((s) => s.pushToast);
  const queryClient = useQueryClient();
  const [expandedProgramId, setExpandedProgramId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['trainer', 'myPrograms'],
    queryFn: trainerApi.listMyPrograms,
    enabled: !!profile?.trainerId,
  });

  const createMutation = useMutation({
    mutationFn: () => trainerApi.createProgram({ title: newTitle.trim(), description: newDescription.trim() }),
    onSuccess: () => {
      pushToast('Training program created.', 'success');
      setNewTitle('');
      setNewDescription('');
      queryClient.invalidateQueries({ queryKey: ['trainer', 'myPrograms'] });
    },
    onError: (err) => pushToast(errorText(err, 'Could not create the program'), 'error'),
  });

  if (!profile?.trainerId) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-ink-muted">This account does not have trainer access.</p>
      </div>
    );
  }

  const programs = data?.programs ?? [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold text-ink">Trainer Workspace</h1>
      <p className="mt-1 text-sm text-ink-faint">
        Create a training program, add your learners, and assign existing HelpCertify content for
        them to work through.
      </p>

      <div className="mt-6 rounded-xl border border-surface-border bg-surface-raised p-6">
        <h2 className="mb-3 text-lg font-semibold text-ink">New training program</h2>
        <label className="block text-xs font-medium uppercase tracking-wide text-ink-faint">Title</label>
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="e.g. Desktop Support Engineer - Batch 1"
          className="input-dark mt-1 w-full"
        />
        <label className="mt-3 block text-xs font-medium uppercase tracking-wide text-ink-faint">
          Description (optional)
        </label>
        <textarea
          value={newDescription}
          onChange={(e) => setNewDescription(e.target.value)}
          rows={2}
          className="input-dark mt-1 w-full"
        />
        <button
          type="button"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending || newTitle.trim().length < 2}
          className="mt-4 rounded-lg bg-[#155EEF] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#004EEB] disabled:opacity-60"
        >
          {createMutation.isPending ? 'Creating…' : 'Create program'}
        </button>
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-ink">Your programs</h2>
        {isLoading && <p className="text-sm text-ink-faint">Loading…</p>}
        {!isLoading && programs.length === 0 && <p className="text-sm text-ink-faint">No programs yet.</p>}
        <div className="space-y-3">
          {programs.map((p) => (
            <ProgramCard
              key={p.id}
              program={p}
              expanded={expandedProgramId === p.id}
              onToggle={() => setExpandedProgramId((cur) => (cur === p.id ? null : p.id))}
            />
          ))}
        </div>
      </div>

      <div className="mt-10 border-t border-surface-border pt-8">
        <h2 className="mb-1 text-lg font-semibold text-ink">Publish to the catalog</h2>
        <p className="mb-4 text-sm text-ink-faint">
          Submit a full course/quiz for admin review. Once approved and published, it appears in the
          public catalog for any student to find and buy - separate from the programs above, which
          are only visible to your own learners.
        </p>
        <CatalogSubmissionForm />
      </div>
    </div>
  );
}

function ProgramCard({
  program,
  expanded,
  onToggle,
}: {
  program: TrainingProgramSummary;
  expanded: boolean;
  onToggle: () => void;
}) {
  const pushToast = useUiStore((s) => s.pushToast);
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [pendingRemove, setPendingRemove] = useState<{ uid: string; name: string } | null>(null);

  const { data: learners, isLoading: learnersLoading } = useQuery({
    queryKey: ['trainer', 'programLearners', program.id],
    queryFn: () => listProgramLearners(program.id),
    enabled: expanded,
  });

  const { data: quizzes } = useQuery({ queryKey: ['student', 'quizzes'], queryFn: listAvailableQuizzes, enabled: expanded });
  const { data: practiceBuckets } = useQuery({
    queryKey: ['student', 'practiceTests'],
    queryFn: listPracticeTestsBucketed,
    enabled: expanded,
  });

  const addLearnerMutation = useMutation({
    mutationFn: () => trainerApi.addLearner({ programId: program.id, email: email.trim() }),
    onSuccess: () => {
      pushToast('Learner added.', 'success');
      setEmail('');
      queryClient.invalidateQueries({ queryKey: ['trainer', 'programLearners', program.id] });
      queryClient.invalidateQueries({ queryKey: ['trainer', 'myPrograms'] });
    },
    onError: (err) => pushToast(errorText(err, 'Could not add this learner'), 'error'),
  });

  const removeLearnerMutation = useMutation({
    mutationFn: (learnerUid: string) => trainerApi.removeLearner({ programId: program.id, learnerUid }),
    onSuccess: () => {
      pushToast('Learner removed.', 'success');
      queryClient.invalidateQueries({ queryKey: ['trainer', 'programLearners', program.id] });
      queryClient.invalidateQueries({ queryKey: ['trainer', 'myPrograms'] });
    },
    onError: (err) => pushToast(errorText(err, 'Could not remove this learner'), 'error'),
  });

  const assignMutation = useMutation({
    mutationFn: (item: { itemType: 'quiz' | 'practiceTest'; itemId: string }) =>
      trainerApi.assignContent({ programId: program.id, ...item }),
    onSuccess: () => {
      pushToast('Content assigned.', 'success');
      queryClient.invalidateQueries({ queryKey: ['trainer', 'myPrograms'] });
    },
    onError: (err) => pushToast(errorText(err, 'Could not assign this content'), 'error'),
  });

  const unassignMutation = useMutation({
    mutationFn: (item: { itemType: 'quiz' | 'practiceTest'; itemId: string }) =>
      trainerApi.unassignContent({ programId: program.id, ...item }),
    onSuccess: () => {
      pushToast('Content removed from program.', 'success');
      queryClient.invalidateQueries({ queryKey: ['trainer', 'myPrograms'] });
    },
    onError: (err) => pushToast(errorText(err, 'Could not remove this content'), 'error'),
  });

  const assignedKeys = new Set(program.assignedContent.map((c) => `${c.itemType}_${c.itemId}`));
  const availablePracticeTests = practiceBuckets?.available ?? [];

  return (
    <div className="rounded-xl border border-surface-border bg-surface-raised">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between p-4 text-left">
        <div>
          <div className="font-medium text-ink">{program.title}</div>
          <div className="text-xs text-ink-faint">
            {program.learnerCount} learner{program.learnerCount === 1 ? '' : 's'} ·{' '}
            {program.assignedContent.length} item{program.assignedContent.length === 1 ? '' : 's'} assigned
            {program.status === 'ARCHIVED' && ' · Archived'}
          </div>
        </div>
        <span className="text-ink-faint">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="border-t border-surface-border p-4">
          <h3 className="mb-2 text-sm font-semibold text-ink">Learners</h3>
          {learnersLoading && <p className="text-sm text-ink-faint">Loading…</p>}
          {!learnersLoading && (learners?.length ?? 0) === 0 && (
            <p className="text-sm text-ink-faint">No learners yet.</p>
          )}
          <ul className="space-y-2">
            {learners?.map((l) => (
              <li key={l.id} className="flex items-center justify-between rounded-lg border border-surface-border px-3 py-2 text-sm">
                <div>
                  <div className="text-ink">{l.learnerName || l.learnerEmail}</div>
                  <div className="text-xs text-ink-faint">
                    {l.learnerEmail} · {l.status === 'INVITED' ? 'Invited' : 'Active'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPendingRemove({ uid: l.learnerUid, name: l.learnerName || l.learnerEmail })}
                  className="text-xs font-medium text-red-500 hover:underline"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex gap-2">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="learner@email.com"
              className="input-dark flex-1"
            />
            <button
              type="button"
              onClick={() => addLearnerMutation.mutate()}
              disabled={addLearnerMutation.isPending || !email.trim()}
              className="rounded-lg bg-[#155EEF] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              Add
            </button>
          </div>

          <h3 className="mb-2 mt-6 text-sm font-semibold text-ink">Assigned content</h3>
          {program.assignedContent.length === 0 && <p className="text-sm text-ink-faint">Nothing assigned yet.</p>}
          <ul className="space-y-2">
            {program.assignedContent.map((c) => (
              <li
                key={`${c.itemType}_${c.itemId}`}
                className="flex items-center justify-between rounded-lg border border-surface-border px-3 py-2 text-sm"
              >
                <span className="text-ink">
                  {c.title} <span className="text-xs text-ink-faint">({c.itemType === 'quiz' ? 'Mock Exam' : 'Practice Test'})</span>
                </span>
                <button
                  type="button"
                  onClick={() => unassignMutation.mutate({ itemType: c.itemType, itemId: c.itemId })}
                  className="text-xs font-medium text-red-500 hover:underline"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>

          <h3 className="mb-2 mt-4 text-xs font-medium uppercase tracking-wide text-ink-faint">Assign more</h3>
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {quizzes
              ?.filter((q) => !assignedKeys.has(`quiz_${q.id}`))
              .map((q) => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => assignMutation.mutate({ itemType: 'quiz', itemId: q.id })}
                  className="block w-full rounded-lg border border-surface-border px-3 py-2 text-left text-sm text-ink hover:border-brand-400"
                >
                  {q.title} <span className="text-xs text-ink-faint">(Mock Exam)</span>
                </button>
              ))}
            {availablePracticeTests
              .filter((t) => !assignedKeys.has(`practiceTest_${t.id}`))
              .map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => assignMutation.mutate({ itemType: 'practiceTest', itemId: t.id })}
                  className="block w-full rounded-lg border border-surface-border px-3 py-2 text-left text-sm text-ink hover:border-brand-400"
                >
                  {t.title} <span className="text-xs text-ink-faint">(Practice Test)</span>
                </button>
              ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!pendingRemove}
        title="Remove this learner?"
        message={`"${pendingRemove?.name}" will be removed from this program. Their attendance/history is kept, not deleted.`}
        confirmLabel="Remove"
        danger
        onConfirm={() => {
          if (pendingRemove) removeLearnerMutation.mutate(pendingRemove.uid);
          setPendingRemove(null);
        }}
        onCancel={() => setPendingRemove(null)}
      />
    </div>
  );
}
