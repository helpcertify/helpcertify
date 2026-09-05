import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUiStore } from '@/store/useUiStore';
import { errorText } from '@/lib/errorMessages';
import { courseBuilderApi, type LessonResource } from '../courseBuilderApi';
import { VisualLessonPanel } from '../components/VisualLessonPanel';

type Tab = 'overview' | 'content' | 'visual' | 'quiz' | 'resources';
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'content', label: 'Lesson Content' },
  { id: 'visual', label: 'Visual Lesson' },
  { id: 'quiz', label: 'Quiz' },
  { id: 'resources', label: 'Resources' },
];

// Stage 2: the single-lesson editor. Content, narration and quiz are each
// generated on demand by their own button - nothing runs automatically.
// The Visual Lesson tab is a placeholder here; storyboard generation and
// the in-browser player land in the next increment.
export function LessonEditorPage() {
  const { draftId, lessonKey } = useParams<{ draftId: string; lessonKey: string }>();
  const pushToast = useUiStore((s) => s.pushToast);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('overview');

  const lessonQuery = useQuery({
    queryKey: ['courseBuilder', 'lesson', draftId, lessonKey],
    queryFn: () => courseBuilderApi.getLesson(draftId!, lessonKey!),
    enabled: !!draftId && !!lessonKey,
  });
  const lesson = lessonQuery.data;

  const [overview, setOverview] = useState('');
  const [content, setContent] = useState('');
  const [narration, setNarration] = useState('');
  const [resources, setResources] = useState<LessonResource[]>([]);

  useEffect(() => {
    if (!lesson) return;
    setOverview(lesson.overview);
    setContent(lesson.content);
    setNarration(lesson.narrationScript);
    setResources(lesson.resources);
  }, [lesson]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['courseBuilder', 'lesson', draftId, lessonKey] });

  const genContent = useMutation({
    mutationFn: (force: boolean) => courseBuilderApi.generateLessonContent(draftId!, lessonKey!, force),
    onSuccess: (r) => {
      setOverview(r.overview);
      setContent(r.content);
      setNarration(r.narrationScript);
      queryClient.invalidateQueries({ queryKey: ['aiCourseBuilder', 'myUsage'] });
      invalidate();
      pushToast(r.cached ? 'Nothing changed since last time - kept the existing content.' : 'Lesson content generated.', 'success');
    },
    onError: (err) => pushToast(errorText(err, 'Could not generate lesson content'), 'error'),
  });

  const save = useMutation({
    mutationFn: (patch: Parameters<typeof courseBuilderApi.updateLesson>[2]) =>
      courseBuilderApi.updateLesson(draftId!, lessonKey!, patch),
    onSuccess: () => {
      invalidate();
      pushToast('Saved', 'success');
    },
    onError: (err) => pushToast(errorText(err, 'Could not save'), 'error'),
  });

  const genQuiz = useMutation({
    mutationFn: () => courseBuilderApi.generateLessonQuiz(draftId!, lessonKey!, 5),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aiCourseBuilder', 'myUsage'] });
      invalidate();
      pushToast('Quiz generated.', 'success');
    },
    onError: (err) => pushToast(errorText(err, 'Could not generate a quiz'), 'error'),
  });

  if (lessonQuery.isLoading) return <p className="text-sm text-ink-faint">Loading…</p>;
  if (!lesson) {
    return (
      <div className="rounded-xl border border-dashed border-surface-border p-8 text-center">
        <p className="mb-4 text-ink-faint">This lesson could not be found.</p>
        <Link to={`/home/creator/courses/${draftId}`} className="rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted hover:border-brand-400">
          Back to the course
        </Link>
      </div>
    );
  }

  const hasContent = content.trim().length > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link to={`/home/creator/courses/${draftId}`} className="text-sm text-brand-ink hover:underline">
        ← {lesson.title ? 'Back to course' : 'Back'}
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-ink">{lesson.title}</h1>
        {lesson.description && <p className="mt-1 text-sm text-ink-faint">{lesson.description}</p>}
      </div>

      <div className="flex flex-wrap gap-1 border-b border-surface-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-t-lg px-3 py-2 text-sm font-medium ${
              tab === t.id ? 'border-b-2 border-[#155EEF] text-[#155EEF]' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-ink-faint">Overview</h2>
            <button
              type="button"
              disabled={genContent.isPending}
              onClick={() => genContent.mutate(false)}
              className="rounded-lg bg-[#155EEF] px-4 py-2 text-sm font-medium text-white hover:bg-[#004EEB] disabled:opacity-60"
            >
              {genContent.isPending ? 'Generating…' : hasContent ? 'Regenerate content' : 'Generate lesson content'}
            </button>
          </div>
          <p className="text-xs text-ink-faint">Generating creates the overview, the lesson content and a narration script together.</p>
          <textarea value={overview} onChange={(e) => setOverview(e.target.value)} rows={5} className="input-dark w-full" placeholder="Short overview of what this lesson covers" />
          <button type="button" disabled={save.isPending} onClick={() => save.mutate({ overview })} className="rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted disabled:opacity-50">
            Save overview
          </button>
        </section>
      )}

      {tab === 'content' && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-ink-faint">Lesson content</h2>
            <button
              type="button"
              disabled={genContent.isPending}
              onClick={() => genContent.mutate(true)}
              className="rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted hover:border-brand-400 disabled:opacity-50"
            >
              {genContent.isPending ? 'Generating…' : 'Regenerate'}
            </button>
          </div>
          <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={12} className="input-dark w-full" placeholder="The lesson body a learner reads" />
          <label className="block text-xs font-medium uppercase tracking-wide text-ink-faint">Narration script</label>
          <textarea value={narration} onChange={(e) => setNarration(e.target.value)} rows={8} className="input-dark w-full" placeholder="The lesson rewritten as spoken narration" />
          <button
            type="button"
            disabled={save.isPending}
            onClick={() => save.mutate({ content, narrationScript: narration })}
            className="rounded-lg bg-[#155EEF] px-4 py-2 text-sm font-medium text-white hover:bg-[#004EEB] disabled:opacity-60"
          >
            Save content
          </button>
        </section>
      )}

      {tab === 'visual' && (
        <VisualLessonPanel draftId={draftId!} lessonKey={lessonKey!} hasContent={hasContent} storyboard={lesson.storyboard} />
      )}

      {tab === 'quiz' && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-ink-faint">Self-check quiz</h2>
            <button
              type="button"
              disabled={genQuiz.isPending}
              onClick={() => genQuiz.mutate()}
              className="rounded-lg bg-[#155EEF] px-4 py-2 text-sm font-medium text-white hover:bg-[#004EEB] disabled:opacity-60"
            >
              {genQuiz.isPending ? 'Generating…' : lesson.quiz.length > 0 ? 'Regenerate quiz' : 'Generate quiz'}
            </button>
          </div>
          {lesson.quiz.length === 0 ? (
            <p className="text-sm text-ink-faint">No quiz yet.</p>
          ) : (
            <ol className="space-y-3">
              {lesson.quiz.map((q) => (
                <li key={q.order} className="rounded-lg border border-surface-border p-3 text-sm">
                  <div className="font-medium text-ink">{q.order + 1}. {q.questionText}</div>
                  <ul className="mt-1 space-y-0.5 text-xs">
                    {q.options.map((o) => (
                      <li key={o.id} className={o.id === q.correctOptionId ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'text-ink-faint'}>
                        {o.id}. {o.text}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {tab === 'resources' && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-faint">Resources</h2>
          {resources.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={r.label}
                onChange={(e) => setResources((cur) => cur.map((it, idx) => (idx === i ? { ...it, label: e.target.value } : it)))}
                placeholder="Label"
                className="input-dark w-1/3"
              />
              <input
                value={r.url}
                onChange={(e) => setResources((cur) => cur.map((it, idx) => (idx === i ? { ...it, url: e.target.value } : it)))}
                placeholder="https://…"
                className="input-dark flex-1"
              />
              <button type="button" onClick={() => setResources((cur) => cur.filter((_, idx) => idx !== i))} className="rounded border border-surface-border px-2 py-1 text-xs text-ink-muted hover:border-red-300 hover:text-red-500">
                ✕
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setResources((cur) => [...cur, { label: '', url: '' }])} className="rounded-lg border border-surface-border px-3 py-1.5 text-xs font-medium text-ink-muted hover:border-brand-400">
            + Add resource
          </button>
          <div>
            <button
              type="button"
              disabled={save.isPending || resources.some((r) => !r.label.trim() || !/^https?:\/\//.test(r.url.trim()))}
              onClick={() => save.mutate({ resources: resources.map((r) => ({ label: r.label.trim(), url: r.url.trim() })) })}
              className="rounded-lg bg-[#155EEF] px-4 py-2 text-sm font-medium text-white hover:bg-[#004EEB] disabled:opacity-60"
            >
              Save resources
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
