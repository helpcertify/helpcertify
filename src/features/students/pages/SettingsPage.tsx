import { useState } from 'react';
import { useThemeStore } from '@/store/useThemeStore';
import { SunIcon, MoonIcon } from '@/components/common/icons';
import { useAuthStore } from '@/features/auth/store/useAuthStore';
import { authApi } from '@/features/auth/api/authApi';
import { useUiStore } from '@/store/useUiStore';

// Presets cover a typical single sitting; anything longer/odder goes through
// the custom field instead of growing this list.
const STUDY_TIME_PRESETS = [15, 30, 45, 60, 90, 120];

function formatMinutes(total: number): string {
  if (total <= 0) return '0m';
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

// A home for account-wide preferences. Appearance (theme) used to live as a
// standalone icon toggle in the header; it moved here so the header stays
// uncluttered and future settings have a natural place to land — each new
// preference gets its own <section> card below Appearance, not a new header
// icon.
export function SettingsPage() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const profile = useAuthStore((s) => s.profile);
  const firebaseUser = useAuthStore((s) => s.firebaseUser);
  const setSession = useAuthStore((s) => s.setSession);
  const pushToast = useUiStore((s) => s.pushToast);

  const [selectedPreset, setSelectedPreset] = useState(STUDY_TIME_PRESETS[1]);
  const [customMinutes, setCustomMinutes] = useState('');
  const [logging, setLogging] = useState(false);

  const manualStudyMinutes = profile?.manualStudyMinutes ?? 0;

  const handleLogTime = async (minutes: number) => {
    if (!profile || !firebaseUser || minutes <= 0) return;
    setLogging(true);
    try {
      await authApi.logStudyTime(minutes);
      setSession(firebaseUser, { ...profile, manualStudyMinutes: manualStudyMinutes + minutes });
      pushToast(`Logged ${formatMinutes(minutes)} of study time`, 'success');
      setCustomMinutes('');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Could not log study time', 'error');
    } finally {
      setLogging(false);
    }
  };

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-ink">Settings</h1>
      <p className="mb-6 text-sm text-ink-faint">Manage how Helpcertify looks and behaves for you.</p>

      <section className="mb-6 rounded-xl border border-surface-border bg-surface-raised p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink-faint">Appearance</h2>
        <p className="mb-4 mt-1 text-sm text-ink-faint">Choose how the app looks on this device.</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTheme('light')}
            className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium ${
              theme === 'light'
                ? 'border-brand-400 bg-brand-500/15 text-brand-ink'
                : 'border-surface-border text-ink-muted hover:border-brand-400'
            }`}
          >
            <SunIcon className="h-4 w-4" />
            Light
          </button>
          <button
            type="button"
            onClick={() => setTheme('dark')}
            className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium ${
              theme === 'dark'
                ? 'border-brand-400 bg-brand-500/15 text-brand-ink'
                : 'border-surface-border text-ink-muted hover:border-brand-400'
            }`}
          >
            <MoonIcon className="h-4 w-4" />
            Dark
          </button>
        </div>
      </section>

      {/* Manual study-time log — the Home dashboard's "Study time" stat only
          auto-counts submitted quiz-attempt durations (practice-test session
          time isn't tracked anywhere in this data model, see
          StudentHomePage.tsx), so this lets a student add time on top of
          that for study done outside a timed attempt: reading, flashcards,
          re-watching an explanation, etc. It's a running log a student adds
          to, not a single value to overwrite. */}
      <section className="rounded-xl border border-surface-border bg-surface-raised p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink-faint">Study Time</h2>
        <p className="mb-1 mt-1 text-sm text-ink-faint">
          Log time you've spent studying outside a timed quiz or practice session.
        </p>
        <p className="mb-4 text-sm text-ink">
          Logged so far: <span className="font-semibold text-brand-ink">{formatMinutes(manualStudyMinutes)}</span>
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedPreset}
            onChange={(e) => setSelectedPreset(Number(e.target.value))}
            className="input-dark w-auto"
            aria-label="Preset study time"
          >
            {STUDY_TIME_PRESETS.map((m) => (
              <option key={m} value={m}>
                {formatMinutes(m)}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={logging}
            onClick={() => handleLogTime(selectedPreset)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
          >
            Log Time
          </button>

          <span className="mx-1 text-sm text-ink-faint">or</span>

          <input
            type="number"
            min={1}
            max={1440}
            value={customMinutes}
            onChange={(e) => setCustomMinutes(e.target.value)}
            placeholder="Custom minutes"
            className="input-dark w-36"
            aria-label="Custom study time in minutes"
          />
          <button
            type="button"
            disabled={logging || !customMinutes || Number(customMinutes) <= 0}
            onClick={() => handleLogTime(Math.round(Number(customMinutes)))}
            className="rounded-lg border border-blue-500 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-60 dark:text-blue-300 dark:hover:bg-blue-500/10"
          >
            Add Time
          </button>
        </div>
      </section>
    </div>
  );
}
