/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class', // toggled on <html> by useThemeStore — see src/styles/globals.css for the token values
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Blue accent (matches the Buy Now / Finish / Submit buttons, which
        // were already this exact Tailwind blue scale — the rebrand makes
        // the whole app consistent with them rather than introducing a
        // second blue). 50/400/500/600 stay fixed across both themes, same
        // as before. `ink` is the one shade that's theme-aware: brand-300/
        // 400 read fine as text against a near-black dark background, but
        // are too pale for reliable contrast against a white one — ink
        // swaps to a solid, darker blue in light mode instead.
        brand: {
          50: '#eff6ff',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          ink: 'rgb(var(--color-brand-ink) / <alpha-value>)',
        },
        // surface/ink are CSS-variable-backed (defined per-theme in
        // globals.css) so every existing bg-surface/text-ink usage across
        // the app repaints for the active theme with no per-component
        // changes needed. The `<alpha-value>` placeholder is Tailwind's
        // hook for opacity modifiers (bg-surface-raised/50 etc.) to keep
        // working against a CSS-variable color.
        surface: {
          DEFAULT: 'rgb(var(--color-surface) / <alpha-value>)',
          raised: 'rgb(var(--color-surface-raised) / <alpha-value>)',
          border: 'rgb(var(--color-surface-border) / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'rgb(var(--color-ink) / <alpha-value>)', // primary text — replaces text-white
          muted: 'rgb(var(--color-ink-muted) / <alpha-value>)', // secondary text — replaces text-neutral-300
          faint: 'rgb(var(--color-ink-faint) / <alpha-value>)', // tertiary/label text — replaces text-neutral-400/500
        },
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(90deg, #60a5fa 0%, #2563eb 100%)',
      },
    },
  },
  plugins: [],
};
