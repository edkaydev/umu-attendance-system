import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        umu: {
          red: '#CC0000',
          'red-dark': '#A30000',
          yellow: '#F5C800',
          'yellow-light': '#FFF4B2',
          black: '#1A1A1A',
        },
        surface: {
          0: '#FFFFFF',
          1: '#F8F9FA',
          2: '#F1F3F5',
          3: '#E9ECEF',
        },
        border: '#E2E8F0',
        'text-primary': '#1A1A2E',
        'text-secondary': '#64748B',
        'text-disabled': '#CBD5E1',
        success: {
          DEFAULT: '#16A34A',
          light: '#DCFCE7',
          border: '#BBF7D0',
        },
        warning: {
          DEFAULT: '#D97706',
          light: '#FEF3C7',
          border: '#FDE68A',
        },
        danger: {
          DEFAULT: '#DC2626',
          light: '#FEE2E2',
          border: '#FECACA',
        },
        info: {
          DEFAULT: '#2563EB',
          light: '#DBEAFE',
          border: '#BFDBFE',
        },
      },
      fontFamily: {
        sans: ['Google Sans', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['Google Sans Mono', 'Roboto Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        display: ['48px', '1.1'],
        h1: ['32px', '1.2'],
        h2: ['24px', '1.3'],
        h3: ['20px', '1.4'],
        'body-lg': ['16px', '1.6'],
        'body-sm': ['12px', '1.5'],
        label: ['12px', '1.4'],
      },
      fontWeight: {
        'display-bold': '700',
      },
      borderRadius: {
        DEFAULT: '10px',
        md: '14px',
        lg: '20px',
      },
      boxShadow: {
        sm: '0 1px 3px rgba(0,0,0,0.06)',
        DEFAULT: '0 4px 12px rgba(0,0,0,0.08)',
        md: '0 8px 24px rgba(0,0,0,0.10)',
        lg: '0 16px 40px rgba(0,0,0,0.12)',
      },
      spacing: {
        1: '4px',
        2: '8px',
        3: '12px',
        4: '16px',
        5: '20px',
        6: '24px',
        8: '32px',
        10: '40px',
        12: '48px',
      },
    },
  },
  plugins: [],
} satisfies Config
