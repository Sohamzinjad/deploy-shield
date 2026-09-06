/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cyber: {
          bg: '#060913',
          card: '#0c1222',
          cardHover: '#111a30',
          border: 'rgba(255, 255, 255, 0.08)',
          cyan: '#38bdf8',
          blue: '#3b82f6',
          indigo: '#6366f1',
          purple: '#8b5cf6',
          danger: '#f43f5e',
          success: '#10b981',
          warning: '#f59e0b',
        }
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        'glow-cyan': '0 0 25px rgba(56, 189, 248, 0.25)',
        'glow-indigo': '0 0 30px rgba(99, 102, 241, 0.3)',
        'glow-danger': '0 0 25px rgba(244, 63, 94, 0.25)',
      }
    },
  },
  plugins: [],
}
