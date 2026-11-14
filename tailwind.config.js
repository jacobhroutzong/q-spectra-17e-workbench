/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        obsidian: '#09090b',
        tactical: {
          bg: '#09090b',
          panel: 'rgba(24, 24, 27, 0.45)',
          border: 'rgba(255, 255, 255, 0.07)',
          cyan: '#38bdf8',
          emerald: '#34d399',
          amber: '#fbbf24',
          crimson: '#f43f5e'
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'ui-monospace', 'monospace'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif']
      }
    },
  },
  plugins: [],
}
