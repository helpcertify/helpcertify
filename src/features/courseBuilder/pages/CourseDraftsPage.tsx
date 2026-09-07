import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUiStore } from '@/store/useUiStore';
import { errorText } from '@/lib/errorMessages';
import { CategorySelect } from '@/components/common/CategorySelect';
import { SKILL_LEVELS, type SkillLevel } from '@/types/models';
import { aiCourseBuilderApi } from '@/features/catalogSubmissions/api/aiCourseBuilderApi';
import { courseBuilderApi } from '../courseBuilderApi';
import { courseBuilderBase } from '../basePath';
import { useMyCreatorEntitlements, useMyCreatorCredits } from '@/features/creator/hooks/useCreatorCommerce';

// Stage 1 of AI course creation: the brief form + a list of the creator's
// existing course drafts. "Generate Course with AI" creates a draft and
// routes into the editor (CourseEditorPage). Feature-gated the same way as
// AiCourseBuilderFlow - renders nothing without ai_course_builder access.
export function CourseDraftsPage() {
  const navigate = useNavigate();
  const base = courseBuilderBase(useLocation().pathname);
  const pushToast = useUiStore((s) => s.pushToast);
  const queryClient = useQueryClient();

  const { data: access } = useQuery({ queryKey: ['aiCourseBuilder', 'myAccess'], queryFn: aiCourseBuilderApi.checkMyAccess });
  const { data: usage } = useQuery({ queryKey: ['aiCourseBuilder', 'myUsage'], queryFn: aiCourseBuilderApi.getMyUsage });
  const { data: drafts } = useQuery({ queryKey: ['courseBuilder', 'myDrafts'], queryFn: courseBuilderApi.listMyDrafts });

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [audience, setAudience] = useState('');
  const [difficulty, setDifficulty] = useState<SkillLevel>('Foundation');
  const [lessonCount, setLessonCount] = useState('8');
  const [language, setLanguage] = useState('English');
  const [category, setCategory] = useState('Other');

  const ent = useMyCreatorEntitlements();
  const { data: credits } = useMyCreatorCredits();
  // The method chooser only appears once the Creator commercial model is
  // switched on; before that the page behaves exactly as before.
  const commerce = ent.commerceEnabled;
  const [method, setMethod] = useState<'ai' | 'manual'>('ai');
  const activeMethod = !commerce ? 'ai' : method;

  const startManual = useMutation({
    mutationFn: () =>
      courseBuilderApi.createBlankDraft({
        title: title.trim(),
        description: description.trim(),
        targetAudience: audience.trim(),
        difficulty,
        language: language.trim() || 'English',
        category,
        lessonCount: Number(lessonCount) || 5,
      }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['courseBuilder', 'myDrafts'] });
      pushToast('Course started. Add your lessons in the editor.', 'success');
      navigate(`${base}/${r.draftId}`);
    },
    onError: (err) => pushToast(errorText(err, 'Could not start the course'), 'error'),
  });

  const generate = useMutation({
    mutationFn: () =>
      courseBuilderApi.generateBlueprint({
        title: title.trim(),
        description: description.trim(),
        targetAudience: audience.trim(),
        difficulty,
        lessonCount: Number(lessonCount) || 8,
        language: language.trim() || 'English',
        category,
      }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['aiCourseBuilder', 'myUsage'] });
      queryClient.invalidateQueries({ queryKey: ['courseBuilder', 'myDrafts'] });
      pushToast(`Blueprint ready: ${r.outline.length} lesson(s). Review and edit before generating content.`, 'success');
      navigate(`${base}/${r.draftId}`);
    },
    onError: (err) => pushToast(errorText(err, 'Could not generate the course'), 'error'),
  });

  if (!commerce && access && !access.allowed) {
    return (
      <div className="mx-auto max-w-4xl">
        <p className="rounded-xl border border-dashed border-surface-border p-6 text-center text-sm text-ink-faint">
          AI course creation is not enabled on this account. An admin can grant access under Settings, Feature Access.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Create a course</h1>
        <p className="mt-1 text-sm text-ink-faint">
          {activeMethod === 'ai'
            ? 'Describe the course. AI drafts a structure you can edit lesson by lesson; lesson content is generated later, on demand.'
            : 'Set up the course, then write each lesson yourself in the editor.'}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {commerce && (
            <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-ink">
              HelpCertify AI Credits: {credits?.balance ?? 0}
            </span>
          )}
          {usage && usage.limit >= 0 && (
            <span className={`text-xs font-medium ${usage.used >= usage.limit ? 'text-danger' : 'text-ink-faint'}`}>
              {Math.max(0, usage.limit - usage.used)} of {usage.limit} AI generations left this month
            </span>
          )}
        </div>
      </div>

      {commerce && (
        <div className="flex flex-wrap gap-3">
          {(['manual', 'ai'] as const).map((m) => {
            const owned = m === 'ai' ? ent.hasCourseAi : ent.hasCourseManual;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  activeMethod === m
                    ? 'border-brand-500 bg-brand-500 text-white'
                    : 'border-surface-border-strong bg-surface-raised text-ink-muted hover:border-brand-400'
                }`}
              >
                {m === 'ai' ? 'Create with AI' : 'Build Manually'}
                {!owned && <span className="ml-1.5 opacity-70">· locked</span>}
              </button>
            );
          })}
        </div>
      )}

      {commerce && activeMethod === 'ai' && !ent.hasCourseAi ? (
        <UpgradeCard message="AI course creation needs the Course Creator - AI plan." />
      ) : commerce && activeMethod === 'manual' && !ent.hasCourseManual ? (
        <UpgradeCard message="Manual course creation needs the Course Creator - Manual plan." />
      ) : (
      <section className="space-y-3 rounded-xl border border-surface-border bg-surface-raised p-6">
        <label className="block text-xs font-medium uppercase tracking-wide text-ink-faint">Course title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Networking Basics" className="input-dark w-full" />

        <label className="block text-xs font-medium uppercase tracking-wide text-ink-faint">Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="input-dark w-full" placeholder="What the course covers and why it matters" />

        <label className="block text-xs font-medium uppercase tracking-wide text-ink-faint">Target audience</label>
        <input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="e.g. IT support staff moving into networking" className="input-dark w-full" />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-faint">Difficulty</label>
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as SkillLevel)} className="input-dark w-full">
              {SKILL_LEVELS.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-faint">Lessons</label>
            <input type="number" min={1} max={20} value={lessonCount} onChange={(e) => setLessonCount(e.target.value)} className="input-dark w-full" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-faint">Language</label>
            <input value={language} onChange={(e) => setLanguage(e.target.value)} className="input-dark w-full" />
          </div>
        </div>

        <label className="block text-xs font-medium uppercase tracking-wide text-ink-faint">Category</label>
        <CategorySelect value={category} onChange={setCategory} />

        {activeMethod === 'ai' ? (
          <button
            type="button"
            disabled={generate.isPending || title.trim().length < 3}
            onClick={() => generate.mutate()}
            className="mt-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {generate.isPending ? 'Generating course…' : 'Generate Course with AI'}
          </button>
        ) : (
          <button
            type="button"
            disabled={startManual.isPending || title.trim().length < 3}
            onClick={() => startManual.mutate()}
            className="mt-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {startManual.isPending ? 'Starting…' : 'Start building'}
          </button>
        )}
      </section>
      )}

      <section className="rounded-xl border border-surface-border bg-surface-raised p-6">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-faint">My course drafts</h2>
        {(drafts?.drafts ?? []).length === 0 ? (
          <p className="text-sm text-ink-faint">No course drafts yet.</p>
        ) : (
          <ul className="divide-y divide-surface-border/60">
            {(drafts?.drafts ?? []).map((d) => (
              <li key={d.draftId} className="flex items-center justify-between py-2.5">
                <div className="min-w-0">
                  <Link to={`${base}/${d.draftId}`} className="font-medium text-ink hover:text-brand-ink">
                    {d.title}
                  </Link>
                  <div className="text-xs text-ink-faint">
                    {d.lessonCount} lesson{d.lessonCount === 1 ? '' : 's'} · {d.status}
                  </div>
                </div>
                <Link to={`${base}/${d.draftId}`} className="shrink-0 text-sm font-semibold text-brand-ink hover:underline">
                  Open
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function UpgradeCard({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-surface-border bg-surface-raised p-6 text-center">
      <p className="text-sm text-ink-faint">{message}</p>
      <Link
        to="/home/creator/plans"
        className="mt-3 inline-block rounded-lg bg-brand-500 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-600"
      >
        View Creator plans
      </Link>
    </div>
  );
}
