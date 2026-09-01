import { useState } from 'react';
import { CERTIFICATION_CATEGORIES } from '@/types/models';

interface CategorySelectProps {
  value: string;
  onChange: (value: string) => void;
}

const CUSTOM_SENTINEL = '__custom__';

// Used on both the Quiz and Practice Test admin forms. The category field
// is stored as a plain string (api/content-admin.ts's schema accepts any
// non-empty string, not just this fixed list - see its own comment), so an
// admin whose vendor isn't in CERTIFICATION_CATEGORIES can type their own
// instead of being stuck picking the closest fit or "Other". Switches to a
// text input either when "+ Add new category" is chosen, or when editing
// an item whose stored category isn't one of the known options at all
// (i.e. it's already a previously-typed custom value).
export function CategorySelect({ value, onChange }: CategorySelectProps) {
  const isKnown = (CERTIFICATION_CATEGORIES as readonly string[]).includes(value);
  const [customMode, setCustomMode] = useState(!isKnown && value !== '');

  if (customMode) {
    return (
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type the certification body / vendor"
          className="input-dark flex-1"
          autoFocus
        />
        <button
          type="button"
          onClick={() => {
            setCustomMode(false);
            onChange('Other');
          }}
          className="shrink-0 rounded-lg border border-surface-border px-3 text-sm text-ink-muted hover:border-brand-400"
        >
          Use list
        </button>
      </div>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => {
        if (e.target.value === CUSTOM_SENTINEL) {
          setCustomMode(true);
          onChange('');
        } else {
          onChange(e.target.value);
        }
      }}
      className="input-dark"
    >
      {CERTIFICATION_CATEGORIES.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
      <option value={CUSTOM_SENTINEL}>+ Add new category…</option>
    </select>
  );
}
