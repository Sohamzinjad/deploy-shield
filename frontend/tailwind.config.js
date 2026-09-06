/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        vercel: {
          bg: '#000000',
          surface: '#0a0a0a',
          card: '#111111',
          cardHover: '#171717',
          border: '#262626',
          borderHover: '#404040',
          muted: '#888888',
          text: '#ededed',
          accent: '#0070f3',
          success: '#0070f3',
          danger: '#ee0000',
          warning: '#f5a623',
        }
      },
      fontFamily: {
        sans: ['"Geist"', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"Geist Mono"', '"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        'vercel': '0 0 0 1px rgba(255, 255, 255, 0.1)',
        'vercel-hover': '0 0 0 1px rgba(255, 255, 255, 0.2), 0 8px 30px rgba(0, 0, 0, 0.5)',
        'glow-white': '0 0 20px rgba(255, 255, 255, 0.15)',
        'glow-blue': '0 0 25px rgba(0, 112, 243, 0.3)',
        'glow-red': '0 0 25px rgba(238, 0, 0, 0.3)',
      },
      animation: {
        'pulse-subtle': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
}
