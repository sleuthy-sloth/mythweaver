/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--mw-canvas)',
        surface: 'var(--mw-surface)',
        ink: 'var(--mw-ink)',
        'ink-soft': 'var(--mw-ink-soft)',
        muted: 'var(--mw-muted)',
        accent: 'var(--mw-accent)',
        border: 'var(--mw-border)',
        'border-strong': 'var(--mw-border-strong)',
        danger: 'var(--mw-danger)',
        success: 'var(--mw-success)',
        warning: 'var(--mw-warning)',
      },
      fontFamily: {
        display: ["'Spectral'", "'Iowan Old Style'", 'Palatino', 'Georgia', 'serif'],
        body: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          "'Segoe UI'",
          'Roboto',
          "'Helvetica Neue'",
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
