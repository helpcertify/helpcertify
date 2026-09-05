import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUiStore } from '@/store/useUiStore';
import { errorText } from '@/lib/errorMessages';
import { majorToMinor } from '@/utils/currency';
import { SKILL_LEVELS, type SkillLevel } from '@/types/models';
import { courseBuilderApi, type CourseLessonOutline, type CourseMeta } from '../courseBuilderApi';
import { StringListEditor } from '../components/StringListEditor';

const BLANK_META: CourseMeta = {
  title: '',
  description: '',
  targetAudience: '',
  difficulty: 'Foundation',
  language: 'English',
  learningObjectives: [],
};

// Stage 1 editor: course settings + the lesson list (edit / add / remove /
// reorder) before any lesson content or visual lesson is generated. Lesson
// content, quizzes and visual lessons arrive as per-lesson panels in a
// later PR.
export function CourseEditorPage() {
  const { draftId } = useParams<{ draftId: string }>();
  const navigate = useNavigate();
  const pushToast = useUiStore((s) => s.pushToast);
  const queryClient = useQueryClient();
  const [priceInput, setPriceInput] = useState('0');

  const { data: draft, isLoading } = useQuery({
    queryKey: ['courseBuilder', 'draft', draftId],
    queryFn: () => courseBuilderApi.getDraft(draftId!),
    enabled: !!draftId,
  });

  const [meta, setMeta] = useState<CourseMeta>(BLANK_META);
  const [lessons, setLessons] = useState<CourseLessonOutline[]>([]);
  const [dirty, setDirty] = useState(false);

  // Seed local editing state once the draft loads (and whenever a fresh
  // copy arrives after a save).
  useEffect(() => {
    if (!draft) return;
    setMeta(draft.courseMeta ?? { ...BLANK_META });
    setLessons(draft.outline ?? []);
    setDirty(false);
  }, [draft]);

  const save = useMutation({
    mutationFn: () => {
      const normalized = lessons.map((l, i) => ({ ...l, moduleIndex: i }));
      return courseBuilderApi.updateDraft(draftId!, meta, normalized);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courseBuilder', 'draft', draftId] });
      queryClient.invalidateQueries({ queryKey: ['courseBuilder', 'myDrafts'] });
      pushToast('Course saved', 'success');
      setDirty(false);
    },
    onError: (err) => pushToast(errorText(err, 'Could not save the course'), 'error'),
  });

  const submit = useMutation({
    mutationFn: () =>
      courseBuilderApi.submitDraft(draftId!, { suggestedPrice: majorToMinor(Number(priceInput) || 0), currency: 'INR' }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['courseBuilder', 'myDrafts'] });
      pushToast(
        r.autoApproved
          ? `Submitted and auto-approved (${r.totalLessons} lessons). Publish it from the Creators admin page.`
          : `Submitted for review: ${r.totalLessons} lessons.`,
        'success',
      );
      navigate('/home/creator/courses');
    },
    onError: (err) => pushToast(errorText(err, 'Could not submit this course'), 'error'),
  });

  const patchMeta = (patch: Partial<CourseMeta>) => {
    setMeta((m) => ({ ...m, ...patch }));
    setDirty(true);
  };
  const patchLesson = (index: number, patch: Partial<CourseLessonOutline>) => {
    setLessons((cur) => cur.map((l, i) => (i === index ? { ...l, ...patch } : l)));
    setDirty(true);
  };
  const moveLesson = (index: number, dir: -1 | 1) => {
    setLessons((cur) => {
      const target = index + dir;
      if (target < 0 || target >= cur.length) return cur;
      const next = [...cur];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setDirty(true);
  };
  const removeLesson = (index: number) => {
    setLessons((cur) => cur.filter((_, i) => i !== index));
    setDirty(true);
  };
  const addLesson = () => {
    setLessons((cur) => [
      ...cur,
      { moduleIndex: cur.length, title: 'New lesson', description: '', objectives: [], estimatedMinutes: 10 },
    ]);
    setDirty(true);
  };

  if (isLoading) return <p className="text-sm text-ink-faint">Loading…</p>;
  if (!draft) {
    return (
      <div className="rounded-xl border border-dashed border-surface-border p-8 text-center">
        <p className="mb-4 text-ink-faint">This course draft could not be found.</p>
        <Link to="/home/creator/courses" className="rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted hover:border-brand-400">
          Back to my courses
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Link to="/home/creator/courses" className="text-sm text-brand-ink hover:underline">
          ← My courses
        </Link>
        <button
          type="button"
          disabled={save.isPending || !dirty || meta.title.trim().length < 3 || lessons.length === 0}
          onClick={() => save.mutate()}
          className="rounded-lg bg-[#155EEF] px-5 py-2 text-sm font-semibold text-white hover:bg-[#004EEB] disabled:opacity-50"
        >
          {save.isPending ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
        </button>
      </div>

      <section className="space-y-3 rounded-xl border border-surface-border bg-surface-raised p-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink-faint">Course settings</h2>

        <label className="block text-xs font-medium uppercase tracking-wide text-ink-faint">Title</label>
        <input value={meta.title} onChange={(e) => patchMeta({ title: e.target.value })} className="input-dark w-full" />

        <label className="block text-xs font-medium uppercase tracking-wide text-ink-faint">Description</label>
        <textarea value={meta.description} onChange={(e) => patchMeta({ description: e.target.value })} rows={4} className="input-dark w-full" />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-faint">Target audience</label>
            <input value={meta.targetAudience} onChange={(e) => patchMeta({ targetAudience: e.target.value })} className="input-dark w-full" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-faint">Difficulty</label>
              <select value={meta.difficulty} onChange={(e) => patchMeta({ difficulty: e.target.value as SkillLevel })} className="input-dark w-full">
                {SKILL_LEVELS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-faint">Language</label>
              <input value={meta.language} onChange={(e) => patchMeta({ language: e.target.value })} className="input-dark w-full" />
            </div>
          </div>
        </div>

        <label className="block text-xs font-medium uppercase tracking-wide text-ink-faint">Learning objectives</label>
        <StringListEditor
          items={meta.learningObjectives}
          onChange={(learningObjectives) => patchMeta({ learningObjectives })}
          placeholder="Add a learning objective"
        />
      </section>

      <section className="space-y-3 rounded-xl border border-surface-border bg-surface-raised p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-faint">Lessons ({lessons.length})</h2>
          <button type="button" onClick={addLesson} className="rounded-lg border border-surface-border px-3 py-1.5 text-xs font-medium text-ink-muted hover:border-brand-400">
            + Add lesson
          </button>
        </div>

        <div className="space-y-3">
          {lessons.map((l, i) => (
            <div key={i} className="rounded-lg border border-surface-border p-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-ink-faint">{i + 1}.</span>
                <input value={l.title} onChange={(e) => patchLesson(i, { title: e.target.value })} className="input-dark flex-1" />
                <button type="button" onClick={() => moveLesson(i, -1)} disabled={i === 0} className="rounded border border-surface-border px-2 py-1 text-xs text-ink-muted disabled:opacity-40">↑</button>
                <button type="button" onClick={() => moveLesson(i, 1)} disabled={i === lessons.length - 1} className="rounded border border-surface-border px-2 py-1 text-xs text-ink-muted disabled:opacity-40">↓</button>
                <button type="button" onClick={() => removeLesson(i)} className="rounded border border-red-300 px-2 py-1 text-xs text-red-500">Remove</button>
              </div>
              <div className="mt-2">
                {l.lessonKey && !dirty ? (
                  <Link to={`/home/creator/courses/${draftId}/lessons/${l.lessonKey}`} className="text-xs font-semibold text-[#155EEF] hover:underline">
                    Open lesson editor (content, quiz, visual lesson) →
                  </Link>
                ) : (
                  <span className="text-xs text-ink-faint">Save the course to open this lesson's editor.</span>
                )}
              </div>
              <textarea
                value={l.description}
                onChange={(e) => patchLesson(i, { description: e.target.value })}
                rows={2}
                placeholder="Short lesson description"
                className="input-dark mt-2 w-full"
              />
              <div className="mt-2 flex items-center gap-3">
                <label className="text-xs text-ink-faint">
                  Duration (min)
                  <input
                    type="number"
                    min={1}
                    max={180}
                    value={l.estimatedMinutes}
                    onChange={(e) => patchLesson(i, { estimatedMinutes: Number(e.target.value) || 1 })}
                    className="input-dark ml-2 w-20"
                  />
                </label>
              </div>
              <div className="mt-2">
                <span className="block text-xs font-medium uppercase tracking-wide text-ink-faint">Lesson objectives</span>
                <StringListEditor
                  items={l.objectives}
                  onChange={(objectives) => patchLesson(i, { objectives })}
                  placeholder="Add a lesson objective"
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-surface-border bg-surface-raised p-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink-faint">Submit for publishing</h2>
        <p className="text-sm text-ink-faint">
          Every lesson needs generated content first (open each lesson editor). Visual lessons and quizzes are
          optional. An admin sets the final price and publishes.
        </p>
        <label className="block text-xs font-medium uppercase tracking-wide text-ink-faint">Suggested price (₹)</label>
        <input
          type="number"
          min={0}
          value={priceInput}
          onChange={(e) => setPriceInput(e.target.value)}
          className="input-dark w-full sm:w-40"
        />
        <button
          type="button"
          disabled={submit.isPending || dirty || lessons.length === 0}
          onClick={() => submit.mutate()}
          className="rounded-lg bg-[#155EEF] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#004EEB] disabled:opacity-50"
        >
          {submit.isPending ? 'Submitting…' : 'Submit course'}
        </button>
        {dirty && <p className="text-xs text-ink-faint">Save your changes before submitting.</p>}
      </section>
    </div>
  );
}
