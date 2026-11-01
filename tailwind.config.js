/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './*.{ts,tsx}', './components/**/*.{ts,tsx}', './pages/**/*.{ts,tsx}', './services/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Inter Tight"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((k) => [k, `rgb(var(--ink-${k}) / <alpha-value>)`])),
        surface: 'rgb(var(--surface) / <alpha-value>)',
        brand: {
          ...Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((k) => [k, `rgb(var(--brand-${k}) / <alpha-value>)`])),
          // Fixed dark shade for gradients that carry white text (same in light and dark mode).
          deep: 'rgb(var(--brand-deep) / <alpha-value>)',
        },
        mint: { 400: '#5eead4', 500: '#2dd4bf' },
      },
      boxShadow: {
        card: '0 1px 2px rgba(18,18,42,0.04), 0 12px 32px -18px rgba(18,18,42,0.18)',
        pop: '0 30px 80px -24px rgb(var(--brand-950) / 0.4)',
        glow: '0 0 0 1px rgb(var(--brand-500) / 0.25), 0 20px 60px -20px rgb(var(--brand-600) / 0.55)',
      },
      borderRadius: { '4xl': '2rem' },
      keyframes: {
        'fade-up': { '0%': { opacity: 0, transform: 'translateY(12px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
        marquee: { '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(-50%)' } },
        'slide-in': { '0%': { transform: 'translateX(100%)' }, '100%': { transform: 'translateX(0)' } },
      },
      animation: {
        'fade-up': 'fade-up .5s ease-out both',
        marquee: 'marquee 40s linear infinite',
        'slide-in': 'slide-in .28s cubic-bezier(.2,.8,.2,1) both',
      },
    },
  },
  plugins: [],
};
