import { useState } from 'react';
import type { EditableQuestion, QuestionOption } from '../api/contentAdminApi';

interface SaveData {
  questionText: string;
  options: QuestionOption[];
  correctOptionId: string;
  domain?: string;
}

interface ListProps {
  questions: EditableQuestion[];
  onSave: (questionId: string, data: SaveData) => Promise<void>;
}

// Shared by QuizAnswerKeyPage and PracticeTestAnswerKeyPage - fixing a
// typo, a wrong option, or which answer is marked correct in an
// already-uploaded bank previously meant re-uploading the whole .docx.
export function QuestionEditorList({ questions, onSave }: ListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="mt-6 space-y-6">
      {questions.map((q, i) =>
        editingId === q.id ? (
          <QuestionEditForm
            key={q.id}
            question={q}
            index={i}
            onCancel={() => setEditingId(null)}
            onSave={async (data) => {
              await onSave(q.id, data);
              setEditingId(null);
            }}
          />
        ) : (
          <div key={q.id}>
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-ink">
                  Q{i + 1}: {q.questionText}
                </h3>
                {q.domain && (
                  <span className="mt-1 inline-block rounded-full bg-brand-500/15 px-2 py-0.5 text-xs text-brand-ink">{q.domain}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setEditingId(q.id)}
                className="shrink-0 rounded-lg border border-surface-border px-3 py-1 text-xs text-ink-muted hover:border-brand-400"
              >
                Edit
              </button>
            </div>
            <ul className="space-y-1 pl-1">
              {q.options.map((opt) => (
                <li key={opt.id} className={opt.id === q.correctOptionId ? 'font-medium text-emerald-700 dark:text-emerald-400' : 'text-ink-muted'}>
                  • {opt.text}
                </li>
              ))}
            </ul>
          </div>
        )
      )}
    </div>
  );
}

function QuestionEditForm({
  question,
  index,
  onCancel,
  onSave,
}: {
  question: EditableQuestion;
  index: number;
  onCancel: () => void;
  onSave: (data: SaveData) => Promise<void>;
}) {
  const [questionText, setQuestionText] = useState(question.questionText);
  const [options, setOptions] = useState<QuestionOption[]>(question.options.map((o) => ({ ...o })));
  const [correctOptionId, setCorrectOptionId] = useState(question.correctOptionId ?? question.options[0]?.id ?? '');
  const [domain, setDomain] = useState(question.domain ?? '');
  const [saving, setSaving] = useState(false);

  const updateOptionText = (id: string, text: string) =>
    setOptions((prev) => prev.map((o) => (o.id === id ? { ...o, text } : o)));

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ questionText, options, correctOptionId, domain });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-brand-400 bg-surface p-4">
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-faint">Question {index + 1}</label>
      <textarea
        value={questionText}
        onChange={(e) => setQuestionText(e.target.value)}
        rows={3}
        className="input-dark mb-4"
      />
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-faint">
        Domain / Topic (optional)
      </label>
      <input
        value={domain}
        onChange={(e) => setDomain(e.target.value)}
        placeholder="e.g. Information Security Governance"
        className="input-dark mb-4"
      />
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-faint">
        Options: select the correct one
      </label>
      <div className="mb-4 space-y-2">
        {options.map((opt) => (
          <div key={opt.id} className="flex items-center gap-2">
            <input
              type="radio"
              name={`correct-${question.id}`}
              checked={correctOptionId === opt.id}
              onChange={() => setCorrectOptionId(opt.id)}
              className="h-4 w-4 shrink-0"
            />
            <input value={opt.text} onChange={(e) => updateOptionText(opt.id, e.target.value)} className="input-dark flex-1" />
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={saving || !questionText.trim() || options.some((o) => !o.text.trim())}
          onClick={handleSave}
          className="rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-surface-border px-4 py-1.5 text-sm text-ink-muted">
          Cancel
        </button>
      </div>
    </div>
  );
}
