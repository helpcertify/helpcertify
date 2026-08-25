import { useThemeStore } from '@/store/useThemeStore';
import { SunIcon, MoonIcon } from '@/components/common/icons';

// A home for account-wide preferences. Appearance (theme) used to live as a
// standalone icon toggle in the header; it moved here so the header stays
// uncluttered and future settings have a natural place to land — each new
// preference gets its own <section> card below Appearance, not a new header
// icon.
export function SettingsPage() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-ink">Settings</h1>
      <p className="mb-6 text-sm text-ink-faint">Manage how Helpcertify looks and behaves for you.</p>

      <section className="rounded-xl border border-surface-border bg-surface-raised p-5">
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
    </div>
  );
}
