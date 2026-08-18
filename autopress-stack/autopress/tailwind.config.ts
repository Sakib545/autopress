import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f7f8fa', 100: '#eceef2', 200: '#d8dbe4', 300: '#b4bac9',
          400: '#8892a8', 500: '#66718a', 600: '#505970', 700: '#41485b',
          800: '#2f3442', 900: '#171a22', 950: '#0b0d12',
        },
        accent: {
          50: '#eef6ff', 100: '#d9ebff', 200: '#bcdcff', 300: '#8ec6ff',
          400: '#59a6ff', 500: '#3384fb', 600: '#1d64f0', 700: '#164fdc',
          800: '#1841b2', 900: '#1a3b8c', 950: '#142555',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'ui-serif', 'Georgia', 'serif'],
      },
      maxWidth: { prose: '68ch' },
      /* Layered, low-opacity elevation — depth without the "material" look. */
      boxShadow: {
        card: '0 1px 2px -1px rgb(15 23 42 / 0.06), 0 1px 3px 0 rgb(15 23 42 / 0.05)',
        lift: '0 2px 4px -2px rgb(15 23 42 / 0.08), 0 8px 20px -6px rgb(15 23 42 / 0.12)',
        pop: '0 10px 30px -10px rgb(15 23 42 / 0.25)',
      },
      keyframes: {
        'fade-up': { '0%': { opacity: '0', transform: 'translateY(6px)' }, '100%': { opacity: '1', transform: 'none' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
      },
      animation: {
        'fade-up': 'fade-up .35s ease-out both',
        shimmer: 'shimmer 1.6s linear infinite',
      },
      transitionTimingFunction: { swift: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
export default config;
