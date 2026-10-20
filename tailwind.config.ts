import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef8f6',
          100: '#d7efe9',
          500: '#147d6c',
          600: '#0f6b5d',
          700: '#0c574c',
          900: '#123c36',
        },
        ink: '#182524',
      },
      boxShadow: {
        panel: '0 12px 40px rgba(20, 52, 47, 0.07)',
      },
    },
  },
  plugins: [],
} satisfies Config;
