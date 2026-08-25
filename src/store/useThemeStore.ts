import { create } from 'zustand';

export type Theme = 'light' | 'dark';

// Same check as index.html's inline no-flash script, kept in sync so
// re-running it here (React's first render) agrees with what was already
// applied to <html> before any JS loaded.
function getInitialTheme(): Theme {
  const stored = localStorage.getItem('theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const initialTheme = getInitialTheme();
applyTheme(initialTheme); // idempotent with the inline script — cheap, keeps this store as the one source of truth going forward

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: initialTheme,
  setTheme: (theme) => {
    localStorage.setItem('theme', theme);
    applyTheme(theme);
    set({ theme });
  },
  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
}));
