/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class', // toggled on <html> by useThemeStore — see src/styles/globals.css for the token values
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Violet — the one brand/action color used everywhere (buttons,
        // links, selected nav, focus rings, badges). Bold & Modern redesign
        // (2026-09): replaces the earlier Electric Blue scale, same roles.
        // 50/300/400/500/600/700 stay fixed across both themes; `ink` is the
        // one shade that's theme-aware: 4B33E8 reads fine as text on a
        // near-black dark background but needs a brighter tint for reliable
        // contrast there.
        brand: {
          50: 'rgb(var(--color-brand-50) / <alpha-value>)', // theme-aware "Light Violet Surface"
          300: '#A79AF5',
          400: '#7C67F0',
          500: '#4B33E8', // Primary Violet
          600: '#3A26C4', // Primary Hover
          700: '#2E1DA0', // Primary Pressed
          ink: 'rgb(var(--color-brand-ink) / <alpha-value>)',
        },
        // Coral — the one secondary accent, used sparingly (a highlight
        // chip, a stat-block badge) alongside the violet primary. Never a
        // substitute for brand-500 on primary actions.
        coral: {
          500: '#FF5A36',
          600: '#E8451F',
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
          sunken: 'rgb(var(--color-surface-sunken) / <alpha-value>)',
          border: 'rgb(var(--color-surface-border) / <alpha-value>)',
          'border-strong': 'rgb(var(--color-surface-border-strong) / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'rgb(var(--color-ink) / <alpha-value>)', // primary text — replaces text-white
          muted: 'rgb(var(--color-ink-muted) / <alpha-value>)', // secondary text — replaces text-neutral-300
          faint: 'rgb(var(--color-ink-faint) / <alpha-value>)', // tertiary/label text — replaces text-neutral-400/500
        },
        // Semantic status colours (theme-aware). `-soft` is the tinted
        // background pair for a badge / callout in that tone.
        success: {
          DEFAULT: 'rgb(var(--color-success) / <alpha-value>)',
          soft: 'rgb(var(--color-success-soft) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'rgb(var(--color-warning) / <alpha-value>)',
          soft: 'rgb(var(--color-warning-soft) / <alpha-value>)',
        },
        danger: {
          DEFAULT: 'rgb(var(--color-danger) / <alpha-value>)',
          soft: 'rgb(var(--color-danger-soft) / <alpha-value>)',
        },
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        pop: 'var(--shadow-pop)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(90deg, #7C67F0 0%, #4B33E8 100%)',
      },
      // Manrope (body/UI) + Space Grotesk (display/headings), both loaded
      // from Google Fonts in index.html — Bold & Modern redesign (2026-09).
      // `font-sans` is now actually applied via `body` in globals.css (see
      // that file's comment): it had been declared here but never wired to
      // any element, so every page had been silently falling back to the
      // browser's default sans-serif (Segoe UI on Windows) the whole time.
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
