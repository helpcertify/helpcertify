import { useEffect, useMemo, useState } from 'react';
import { ScenePlayer } from '@/features/visualLessons/components/ScenePlayer';
import type { CourseLessonView } from '../api/courseApi';

type Tab = 'overview' | 'lesson' | 'visual' | 'quiz' | 'resources';

interface CourseLessonReaderProps {
  lesson: CourseLessonView;
  owned: boolean;
  isRead: boolean;
  marking: boolean;
  onMarkRead: () => void;
}

// The learner-facing lesson view: the written lesson plus, when the
// creator generated them, an overview, an in-browser visual lesson
// (ScenePlayer), a self-check quiz and resource links. A locked lesson
// never reaches here with any of this populated (getCourseForReading
// strips it server-side).
export function CourseLessonReader({ lesson, owned, isRead, marking, onMarkRead }: CourseLessonReaderProps) {
  const tabs = useMemo(() => {
    const t: { id: Tab; label: string }[] = [];
    if (lesson.overview) t.push({ id: 'overview', label: 'Overview' });
    t.push({ id: 'lesson', label: 'Lesson' });
    if (lesson.storyboard && lesson.storyboard.scenes.length > 0) t.push({ id: 'visual', label: 'Visual lesson' });
    if (lesson.quiz && lesson.quiz.length > 0) t.push({ id: 'quiz', label: 'Quiz' });
    if (lesson.resources && lesson.resources.length > 0) t.push({ id: 'resources', label: 'Resources' });
    return t;
  }, [lesson]);

  const [tab, setTab] = useState<Tab>('lesson');
  useEffect(() => setTab('lesson'), [lesson.id]);

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold text-ink">{lesson.title}</h2>

      {tabs.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1 border-b border-surface-border">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-t-lg px-3 py-1.5 text-sm font-medium ${
                tab === t.id ? 'border-b-2 border-[#155EEF] text-[#155EEF]' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tab === 'overview' && lesson.overview && (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">{lesson.overview}</p>
      )}

      {tab === 'lesson' && (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">{lesson.content}</p>
      )}

      {tab === 'visual' && lesson.storyboard && <ScenePlayer storyboard={lesson.storyboard} />}

      {tab === 'quiz' && lesson.quiz && <SelfCheckQuiz quiz={lesson.quiz} />}

      {tab === 'resources' && lesson.resources && (
        <ul className="space-y-2 text-sm">
          {lesson.resources.map((r, i) => (
            <li key={i}>
              <a href={r.url} target="_blank" rel="noreferrer" className="text-brand-ink underline">
                {r.label || r.url}
              </a>
            </li>
          ))}
        </ul>
      )}

      {owned && tab === 'lesson' && (
        <button
          type="button"
          disabled={marking}
          onClick={onMarkRead}
          className="mt-6 rounded-lg border border-surface-border px-4 py-2 text-sm text-ink-muted hover:border-brand-400 disabled:opacity-50"
        >
          {isRead ? '✓ Completed' : 'Mark as Read'}
        </button>
      )}
    </div>
  );
}

function SelfCheckQuiz({
  quiz,
}: {
  quiz: NonNullable<CourseLessonView['quiz']>;
}) {
  const [picked, setPicked] = useState<Record<number, string>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});

  return (
    <ol className="space-y-4">
      {quiz.map((q) => {
        const choice = picked[q.order];
        const show = revealed[q.order];
        return (
          <li key={q.order} className="rounded-lg border border-surface-border p-3 text-sm">
            <div className="font-medium text-ink">{q.order + 1}. {q.questionText}</div>
            <div className="mt-2 space-y-1">
              {q.options.map((o) => {
                const isChoice = choice === o.id;
                const isCorrect = o.id === q.correctOptionId;
                const tone = show
                  ? isCorrect
                    ? 'border-emerald-400 text-emerald-700 dark:text-emerald-400'
                    : isChoice
                      ? 'border-red-300 text-red-600'
                      : 'border-surface-border text-ink-muted'
                  : isChoice
                    ? 'border-[#155EEF] text-ink'
                    : 'border-surface-border text-ink-muted hover:border-brand-400';
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setPicked((p) => ({ ...p, [q.order]: o.id }))}
                    className={`block w-full rounded-lg border px-3 py-1.5 text-left ${tone}`}
                  >
                    {o.id}. {o.text}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              disabled={!choice}
              onClick={() => setRevealed((r) => ({ ...r, [q.order]: true }))}
              className="mt-2 rounded-lg border border-surface-border px-3 py-1 text-xs text-ink-muted hover:border-brand-400 disabled:opacity-40"
            >
              {show ? (choice === q.correctOptionId ? 'Correct' : 'Not quite') : 'Check answer'}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
