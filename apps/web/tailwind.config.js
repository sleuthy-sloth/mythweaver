/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--mw-canvas)',
        surface: 'var(--mw-surface)',
        ink: 'var(--mw-ink)',
        muted: 'var(--mw-muted)',
        accent: 'var(--mw-accent)',
        border: 'var(--mw-border)',
        danger: 'var(--mw-danger)',
        success: 'var(--mw-success)',
      },
      fontFamily: {
        display: ['"Iowan Old Style"', 'Palatino', 'Georgia', 'serif'],
        body: ['system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
