import { useEffect, useState } from 'react';

// A native <input type="datetime-local">'s displayed format (12-hour AM/PM
// vs 24-hour) follows the visitor's OS/browser locale - not something HTML
// or CSS can force. This replaces it with an explicit date + hour + minute
// + AM/PM control that always reads as hh:mm AM/PM, for every admin
// regardless of their machine's regional settings. Drop-in compatible:
// value/onChange still use the exact same "YYYY-MM-DDTHH:mm" (24-hour,
// no seconds) string a datetime-local input produces, so every call site's
// surrounding new Date(value).toISOString() / toLocalInputValue() logic is
// unchanged.

interface Props {
  value: string;
  onChange: (value: string) => void;
}

interface Parsed {
  date: string;
  hour12: number;
  minute: number;
  ampm: 'AM' | 'PM';
}

function parse(value: string): Parsed {
  if (!value) return { date: '', hour12: 12, minute: 0, ampm: 'AM' };
  const [date, time] = value.split('T');
  const [hStr, mStr] = (time ?? '00:00').split(':');
  const h24 = Number(hStr) || 0;
  const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return { date, hour12, minute: Number(mStr) || 0, ampm: h24 < 12 ? 'AM' : 'PM' };
}

function toValue(date: string, hour12: number, minute: number, ampm: 'AM' | 'PM'): string {
  if (!date) return '';
  let h24 = hour12 % 12;
  if (ampm === 'PM') h24 += 12;
  return `${date}T${String(h24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

export function DateTime12hInput({ value, onChange }: Props) {
  const initial = parse(value);
  const [date, setDate] = useState(initial.date);
  const [hour12, setHour12] = useState(initial.hour12);
  const [minute, setMinute] = useState(initial.minute);
  const [ampm, setAmpm] = useState<'AM' | 'PM'>(initial.ampm);

  // Re-sync when the parent resets value out from under this component -
  // e.g. resetForm() after a successful create, or switching which item is
  // being edited.
  useEffect(() => {
    const p = parse(value);
    setDate(p.date);
    setHour12(p.hour12);
    setMinute(p.minute);
    setAmpm(p.ampm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const commit = (nextDate: string, nextHour12: number, nextMinute: number, nextAmpm: 'AM' | 'PM') =>
    onChange(toValue(nextDate, nextHour12, nextMinute, nextAmpm));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="date"
        value={date}
        onChange={(e) => {
          setDate(e.target.value);
          commit(e.target.value, hour12, minute, ampm);
        }}
        className="input-dark w-auto"
      />
      <select
        aria-label="Hour"
        value={hour12}
        onChange={(e) => {
          const v = Number(e.target.value);
          setHour12(v);
          commit(date, v, minute, ampm);
        }}
        className="input-dark w-auto"
      >
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {String(h).padStart(2, '0')}
          </option>
        ))}
      </select>
      <span className="text-ink-faint">:</span>
      <select
        aria-label="Minute"
        value={minute}
        onChange={(e) => {
          const v = Number(e.target.value);
          setMinute(v);
          commit(date, hour12, v, ampm);
        }}
        className="input-dark w-auto"
      >
        {MINUTES.map((m) => (
          <option key={m} value={m}>
            {String(m).padStart(2, '0')}
          </option>
        ))}
      </select>
      <select
        aria-label="AM or PM"
        value={ampm}
        onChange={(e) => {
          const v = e.target.value as 'AM' | 'PM';
          setAmpm(v);
          commit(date, hour12, minute, v);
        }}
        className="input-dark w-auto"
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}
