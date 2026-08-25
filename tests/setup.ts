import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement matchMedia at all — useThemeStore.ts calls it
// unconditionally at module load time (to pick a light/dark default before
// any component renders), which crashed every test file that imports
// anything pulling in ThemeToggle/useThemeStore (confirmed: LoginPage.test.tsx
// failed to even load once LoginPage started rendering a ThemeToggle).
// Real browsers all support matchMedia; only the test environment needs
// this stub.
if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
