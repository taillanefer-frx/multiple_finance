import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#F5F6F3',
        surface: '#FFFFFF',
        ink: '#202925',
        muted: '#68726D',
        line: '#E2E6E2',
        petrol: '#1F5B54',
        'petrol-dark': '#174740',
        sage: '#E5EDE9',
        positive: '#2F7D5C',
        amber: '#A66A1F',
        danger: '#B44A50',
      },
      boxShadow: {
        card: '0 12px 32px rgba(32, 41, 37, 0.06)',
        lift: '0 16px 40px rgba(25, 60, 53, 0.14)',
      },
      borderRadius: {
        '2xl': '1.25rem',
        '3xl': '1.75rem',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config
