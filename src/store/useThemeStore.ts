import { create } from 'zustand';

export type Theme = 'light' | 'dark';

// The app is LIGHT by default. Dark mode is a globally admin-gated feature:
// appSettings/appearance.darkModeEnabled, loaded once at boot by
// src/features/appearance/loadAppearance.ts. Until that flag is known - and
// any time it is off - the app is forced to light regardless of a saved
// per-device preference. `hc_dark_allowed` mirrors the last-known flag into
// localStorage so the inline no-flash script in index.html can make the
// same decision before any JS bundle runs.
const ALLOWED_KEY = 'hc_dark_allowed';

function storedPreference(): Theme {
  try {
    return localStorage.getItem('theme') === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function storedAllowed(): boolean {
  try {
    return localStorage.getItem(ALLOWED_KEY) === '1';
  } catch {
    return false;
  }
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

interface ThemeState {
  /** The user's saved per-device preference. Only takes visual effect while darkModeAllowed. */
  theme: Theme;
  /** Whether an admin has enabled the dark-mode feature for everyone. */
  darkModeAllowed: boolean;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setDarkModeAllowed: (allowed: boolean) => void;
}

const initialTheme = storedPreference();
const initialAllowed = storedAllowed();
// Idempotent with index.html's inline script.
applyTheme(initialAllowed ? initialTheme : 'light');

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: initialTheme,
  darkModeAllowed: initialAllowed,
  setTheme: (theme) => {
    try {
      localStorage.setItem('theme', theme);
    } catch {
      /* private mode - preference just won't persist */
    }
    set({ theme });
    applyTheme(get().darkModeAllowed ? theme : 'light');
  },
  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
  setDarkModeAllowed: (allowed) => {
    try {
      localStorage.setItem(ALLOWED_KEY, allowed ? '1' : '0');
    } catch {
      /* ignore */
    }
    set({ darkModeAllowed: allowed });
    applyTheme(allowed ? get().theme : 'light');
  },
}));
