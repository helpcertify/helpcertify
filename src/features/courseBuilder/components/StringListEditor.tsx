import { useState } from 'react';

interface StringListEditorProps {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
}

// A tiny add/edit/remove list of short strings, used for course and lesson
// learning objectives in the course editor.
export function StringListEditor({ items, onChange, placeholder = 'Add an item' }: StringListEditorProps) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const value = draft.trim();
    if (!value) return;
    onChange([...items, value]);
    setDraft('');
  };

  return (
    <div className="mt-1 space-y-1.5">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={item}
            onChange={(e) => onChange(items.map((it, idx) => (idx === i ? e.target.value : it)))}
            className="input-dark flex-1"
          />
          <button
            type="button"
            onClick={() => onChange(items.filter((_, idx) => idx !== i))}
            aria-label="Remove"
            className="rounded border border-surface-border px-2 py-1 text-xs text-ink-muted hover:border-red-300 hover:text-red-500"
          >
            ✕
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="input-dark flex-1"
        />
        <button
          type="button"
          onClick={add}
          disabled={draft.trim().length === 0}
          className="rounded-lg border border-surface-border px-3 py-1.5 text-xs font-medium text-ink-muted hover:border-brand-400 disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </div>
  );
}
