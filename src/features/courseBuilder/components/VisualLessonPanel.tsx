import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useUiStore } from '@/store/useUiStore';
import { errorText } from '@/lib/errorMessages';
import { ScenePlayer } from '@/features/visualLessons/components/ScenePlayer';
import { webSpeechSpeaker } from '@/features/visualLessons/tts';
import { VISUAL_COMPONENT_IDS, type Scene, type Storyboard } from '@/features/visualLessons/storyboard';
import { courseBuilderApi } from '../courseBuilderApi';

interface VisualLessonPanelProps {
  draftId: string;
  lessonKey: string;
  hasContent: boolean;
  storyboard: Storyboard | null;
}

// The Visual Lesson tab: generate a storyboard from the lesson content,
// preview it in the in-browser ScenePlayer, edit each scene, regenerate a
// single scene, and save. Nothing renders a video - the player IS the
// deliverable this phase.
export function VisualLessonPanel({ draftId, lessonKey, hasContent, storyboard }: VisualLessonPanelProps) {
  const pushToast = useUiStore((s) => s.pushToast);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Storyboard | null>(storyboard);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDraft(storyboard);
    setDirty(false);
  }, [storyboard]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['courseBuilder', 'lesson', draftId, lessonKey] });
    queryClient.invalidateQueries({ queryKey: ['aiCourseBuilder', 'myUsage'] });
  };

  const generate = useMutation({
    mutationFn: (force: boolean) => courseBuilderApi.generateStoryboard(draftId, lessonKey, force),
    onSuccess: (r) => {
      setDraft(r.storyboard);
      setDirty(false);
      invalidate();
      pushToast(r.cached ? 'Kept the existing storyboard.' : 'Storyboard generated.', 'success');
    },
    onError: (err) => pushToast(errorText(err, 'Could not generate the visual lesson'), 'error'),
  });

  const regen = useMutation({
    mutationFn: ({ sceneId, instruction }: { sceneId: string; instruction: string }) =>
      courseBuilderApi.regenerateScene(draftId, lessonKey, sceneId, instruction),
    onSuccess: (r) => {
      setDraft(r.storyboard);
      setDirty(false);
      invalidate();
      pushToast('Scene regenerated.', 'success');
    },
    onError: (err) => pushToast(errorText(err, 'Could not regenerate the scene'), 'error'),
  });

  const save = useMutation({
    mutationFn: () => courseBuilderApi.updateLesson(draftId, lessonKey, { storyboard: draft! }),
    onSuccess: () => {
      setDirty(false);
      invalidate();
      pushToast('Storyboard saved.', 'success');
    },
    onError: (err) => pushToast(errorText(err, 'Could not save the storyboard'), 'error'),
  });

  const patchScene = (id: string, patch: Partial<Scene>) => {
    setDraft((sb) =>
      sb ? { ...sb, scenes: sb.scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)) } : sb,
    );
    setDirty(true);
  };
  const setVoice = (voice: string) => {
    setDraft((sb) => (sb ? { ...sb, voice } : sb));
    setDirty(true);
  };

  if (!draft) {
    return (
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink-faint">Visual lesson</h2>
        <p className="text-sm text-ink-faint">
          A visual lesson is a storyboard of animated technical scenes (diagrams, arrows, labelled components) with
          synced narration. It is generated from this lesson's content.
        </p>
        <button
          type="button"
          disabled={!hasContent || generate.isPending}
          onClick={() => generate.mutate(false)}
          className="rounded-lg bg-[#155EEF] px-4 py-2 text-sm font-medium text-white hover:bg-[#004EEB] disabled:opacity-50"
        >
          {generate.isPending ? 'Generating storyboard…' : 'Generate Visual Lesson'}
        </button>
        {!hasContent && <p className="text-xs text-ink-faint">Generate the lesson content first.</p>}
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink-faint">Visual lesson preview</h2>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={generate.isPending}
            onClick={() => generate.mutate(true)}
            className="rounded-lg border border-surface-border px-3 py-1.5 text-xs text-ink-muted hover:border-brand-400 disabled:opacity-50"
          >
            {generate.isPending ? 'Regenerating…' : 'Regenerate all'}
          </button>
          <button
            type="button"
            disabled={!dirty || save.isPending}
            onClick={() => save.mutate()}
            className="rounded-lg bg-[#155EEF] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#004EEB] disabled:opacity-50"
          >
            {save.isPending ? 'Saving…' : dirty ? 'Save storyboard' : 'Saved'}
          </button>
        </div>
      </div>

      <ScenePlayer storyboard={draft} />

      <div className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-ink-faint">Scenes ({draft.scenes.length})</h3>
        {draft.scenes.map((s, i) => (
          <div key={s.id} className="rounded-lg border border-surface-border p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-semibold text-ink-faint">{i + 1}.</span>
              <input value={s.title} onChange={(e) => patchScene(s.id, { title: e.target.value })} className="input-dark flex-1" />
              {webSpeechSpeaker.supported && (
                <button
                  type="button"
                  onClick={() => webSpeechSpeaker.speak(s.narration, { voice: draft.voice || undefined })}
                  disabled={!s.narration.trim()}
                  className="rounded border border-surface-border px-2 py-1 text-xs text-ink-muted hover:border-brand-400 disabled:opacity-40"
                >
                  ▶
                </button>
              )}
              <button
                type="button"
                disabled={regen.isPending}
                onClick={() => regen.mutate({ sceneId: s.id, instruction: '' })}
                className="rounded border border-surface-border px-2 py-1 text-xs text-ink-muted hover:border-brand-400 disabled:opacity-50"
              >
                Regenerate
              </button>
            </div>
            <label className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint">Narration</label>
            <textarea value={s.narration} onChange={(e) => patchScene(s.id, { narration: e.target.value })} rows={2} className="input-dark w-full" />
            <label className="mt-2 block text-[11px] font-medium uppercase tracking-wide text-ink-faint">On-screen text</label>
            <input value={s.onScreenText} onChange={(e) => patchScene(s.id, { onScreenText: e.target.value })} className="input-dark w-full" />
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_120px]">
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint">Components</label>
                <input
                  value={s.components.join(', ')}
                  onChange={(e) =>
                    patchScene(s.id, {
                      components: e.target.value
                        .split(',')
                        .map((c) => c.trim())
                        .filter((c): c is (typeof VISUAL_COMPONENT_IDS)[number] => (VISUAL_COMPONENT_IDS as readonly string[]).includes(c)),
                    })
                  }
                  className="input-dark w-full"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint">Seconds</label>
                <input
                  type="number"
                  min={2}
                  max={40}
                  value={s.durationSeconds}
                  onChange={(e) => patchScene(s.id, { durationSeconds: Number(e.target.value) || 6 })}
                  className="input-dark w-full"
                />
              </div>
            </div>
            <label className="mt-2 block text-[11px] font-medium uppercase tracking-wide text-ink-faint">Animation directives</label>
            <textarea value={s.animation} onChange={(e) => patchScene(s.id, { animation: e.target.value })} rows={2} className="input-dark w-full font-mono text-xs" />
          </div>
        ))}
        <p className="text-xs text-ink-faint">
          Valid component ids: {VISUAL_COMPONENT_IDS.join(', ')}. Animation lines like{' '}
          <code>arrow:user-&gt;server</code>, <code>highlight:database</code>, <code>fadeIn:cloud</code>.
        </p>
      </div>

      <div>
        <label className="block text-[11px] font-medium uppercase tracking-wide text-ink-faint">Default narration voice</label>
        <input
          value={draft.voice}
          onChange={(e) => setVoice(e.target.value)}
          placeholder="Leave blank for the learner's default voice"
          className="input-dark mt-1 w-full sm:w-96"
        />
      </div>
    </section>
  );
}
