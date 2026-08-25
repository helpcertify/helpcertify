/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class', // toggled on <html> by useThemeStore — see src/styles/globals.css for the token values
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Teal/cyan accent — unchanged across both themes, on purpose: a
        // brand color staying recognizable regardless of light/dark is the
        // point of it being "the brand color" (replaces the crimson "seal"
        // accent from the v1 course/certificate UI).
        brand: {
          50: '#ecfeff',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
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
        'brand-gradient': 'linear-gradient(90deg, #2dd4bf 0%, #10b981 100%)',
      },
    },
  },
  plugins: [],
};
