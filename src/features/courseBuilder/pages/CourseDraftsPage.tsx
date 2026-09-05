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

  if (access && !access.allowed) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="rounded-xl border border-dashed border-surface-border p-6 text-center text-sm text-ink-faint">
          AI course creation is not enabled on this account. An admin can grant access under Settings, Feature Access.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Create a course with AI</h1>
        <p className="mt-1 text-sm text-ink-faint">
          Describe the course. AI drafts a structure you can edit lesson by lesson. Lesson content and visual
          lessons are generated later, on demand, one at a time.
        </p>
        {usage && usage.limit >= 0 && (
          <p className={`mt-2 text-xs font-medium ${usage.used >= usage.limit ? 'text-red-500' : 'text-ink-faint'}`}>
            {Math.max(0, usage.limit - usage.used)} of {usage.limit} AI generations left this month
            {usage.used >= usage.limit && ' - limit reached, resets on the 1st'}
          </p>
        )}
      </div>

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

        <button
          type="button"
          disabled={generate.isPending || title.trim().length < 3}
          onClick={() => generate.mutate()}
          className="mt-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {generate.isPending ? 'Generating course…' : 'Generate Course with AI'}
        </button>
      </section>

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
