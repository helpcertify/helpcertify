import { useCallback, useEffect, useRef, useState } from 'react';
import {
  sceneAtTime,
  sceneStartTimes,
  totalDurationSeconds,
  type Storyboard,
} from '../storyboard';
import { webSpeechSpeaker, type NarrationSpeaker } from '../tts';
import { SceneRenderer } from './SceneRenderer';

interface ScenePlayerProps {
  storyboard: Storyboard;
  // Defaults to the Web Speech speaker; injectable for tests / a future
  // real-TTS provider.
  speaker?: NarrationSpeaker;
  className?: string;
}

// Plays a whole storyboard: fixed per-scene durations drive the clock,
// narration plays alongside each scene, SceneRenderer draws the frame.
// Pure consumer of Storyboard data - no AI, no network.
export function ScenePlayer({ storyboard, speaker = webSpeechSpeaker, className }: ScenePlayerProps) {
  const total = totalDurationSeconds(storyboard);
  const starts = sceneStartTimes(storyboard);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [voice, setVoice] = useState(storyboard.voice || '');
  const [voices, setVoices] = useState<{ name: string; lang: string }[]>([]);
  const rafRef = useRef<number | undefined>(undefined);
  const lastTsRef = useRef<number | undefined>(undefined);
  const spokenSceneRef = useRef<number>(-1);

  useEffect(() => {
    const load = () => setVoices(speaker.listVoices());
    load();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = load;
      return () => {
        window.speechSynthesis.onvoiceschanged = null;
      };
    }
  }, [speaker]);

  const at = sceneAtTime(storyboard, elapsed);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
    rafRef.current = undefined;
    lastTsRef.current = undefined;
  }, []);

  useEffect(() => {
    if (!playing) {
      stopLoop();
      speaker.cancel();
      return;
    }
    const tick = (ts: number) => {
      if (lastTsRef.current !== undefined) {
        const dt = (ts - lastTsRef.current) / 1000;
        setElapsed((e) => {
          const next = e + dt;
          if (next >= total) {
            setPlaying(false);
            return total;
          }
          return next;
        });
      }
      lastTsRef.current = ts;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return stopLoop;
  }, [playing, total, speaker, stopLoop]);

  // Speak a scene's narration when it becomes the active scene during
  // playback (and not on manual scrubbing while paused).
  useEffect(() => {
    if (!playing || !at) return;
    if (spokenSceneRef.current === at.index) return;
    spokenSceneRef.current = at.index;
    speaker.speak(at.scene.narration, { voice: voice || undefined });
  }, [playing, at, speaker, voice]);

  useEffect(() => () => speaker.cancel(), [speaker]);

  const seekToScene = (index: number) => {
    speaker.cancel();
    spokenSceneRef.current = -1;
    setElapsed(Math.min(total - 0.001, starts[index] ?? 0));
  };

  const restart = () => {
    speaker.cancel();
    spokenSceneRef.current = -1;
    setElapsed(0);
    setPlaying(true);
  };

  if (storyboard.scenes.length === 0) {
    return <p className="text-sm text-ink-faint">This visual lesson has no scenes yet.</p>;
  }

  return (
    <div className={className}>
      <div className="overflow-hidden rounded-xl border border-surface-border bg-surface">
        {at && <SceneRenderer scene={at.scene} progress={at.sceneProgress} />}
      </div>

      <input
        type="range"
        min={0}
        max={Math.max(0.1, total)}
        step={0.1}
        value={elapsed}
        onChange={(e) => {
          setPlaying(false);
          speaker.cancel();
          spokenSceneRef.current = -1;
          setElapsed(Number(e.target.value));
        }}
        className="mt-3 w-full accent-brand-500"
        aria-label="Seek"
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => (elapsed >= total ? restart() : setPlaying((p) => !p))}
          className="rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-600"
        >
          {elapsed >= total ? 'Replay' : playing ? 'Pause' : 'Play'}
        </button>
        <button
          type="button"
          onClick={() => seekToScene(Math.max(0, (at?.index ?? 0) - 1))}
          className="rounded-lg border border-surface-border px-3 py-1.5 text-sm text-ink-muted hover:border-brand-400"
        >
          ‹ Prev scene
        </button>
        <button
          type="button"
          onClick={() => seekToScene(Math.min(storyboard.scenes.length - 1, (at?.index ?? 0) + 1))}
          className="rounded-lg border border-surface-border px-3 py-1.5 text-sm text-ink-muted hover:border-brand-400"
        >
          Next scene ›
        </button>
        <span className="text-xs text-ink-faint">
          Scene {(at?.index ?? 0) + 1} / {storyboard.scenes.length} · {Math.round(elapsed)}s / {Math.round(total)}s
        </span>
        {speaker.supported && voices.length > 0 && (
          <select
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            className="input-dark ml-auto max-w-[220px] py-1 text-xs"
            aria-label="Narration voice"
          >
            <option value="">Default voice</option>
            {voices.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        )}
      </div>

      {!speaker.supported && (
        <p className="mt-1 text-xs text-ink-faint">Narration audio is not available in this browser; the on-screen text still plays.</p>
      )}

      {at && (
        <div className="mt-3 rounded-lg border border-surface-border bg-surface-raised p-3 text-sm">
          <div className="font-semibold text-ink">{at.scene.title}</div>
          <p className="mt-1 whitespace-pre-wrap text-ink-muted">{at.scene.narration}</p>
        </div>
      )}
    </div>
  );
}
