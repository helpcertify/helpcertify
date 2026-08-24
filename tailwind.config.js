/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Teal/cyan accent + near-black surfaces — the platform's v2 look
        // (replaces the crimson "seal" accent from the v1 course/certificate UI).
        brand: {
          50: '#ecfeff',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
        },
        surface: {
          DEFAULT: '#05070a', // page background
          raised: '#0d1117', // cards
          border: '#1f2937',
        },
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(90deg, #2dd4bf 0%, #10b981 100%)',
      },
    },
  },
  plugins: [],
};
