/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class', // toggled on <html> by useThemeStore — see src/styles/globals.css for the token values
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Electric Blue — the one brand/action color used everywhere
        // (buttons, links, selected nav, focus rings, badges). 50/400/500/
        // 600 stay fixed across both themes; `ink` is the one shade that's
        // theme-aware: 155EEF reads fine as text on a near-black dark
        // background but needs a brighter tint for reliable contrast there.
        // See the HelpCertify design-system spec: 500 is "Primary Electric
        // Blue" (#155EEF), 600 is "Primary Hover" (#004EEB).
        brand: {
          50: 'rgb(var(--color-brand-50) / <alpha-value>)', // theme-aware "Light Blue Surface"
          300: '#8bb4f8',
          400: '#5b93f5',
          500: '#155EEF', // Primary Electric Blue
          600: '#004EEB', // Primary Hover
          700: '#003DB8', // Primary Pressed
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
        'brand-gradient': 'linear-gradient(90deg, #5b93f5 0%, #155EEF 100%)',
      },
      // Inter, loaded from Google Fonts in index.html — the HelpCertify
      // design system's intended body/UI face. Was never actually wired
      // up here, so every page had been silently falling back to the
      // browser's default sans-serif (Segoe UI on Windows) the whole time.
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
