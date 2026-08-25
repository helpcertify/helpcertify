import { useThemeStore } from '@/store/useThemeStore';

// Dropped into any header — StudentShell, AdminShell, the public pages.
// Same visual language as the other icon-only header buttons (cart, mobile
// nav toggle): a bordered square, no fill.
export function ThemeToggle({ className = '' }: { className?: string }) {
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`rounded-lg border border-surface-border p-2.5 text-lg text-ink-muted hover:border-brand-400 ${className}`}
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}
