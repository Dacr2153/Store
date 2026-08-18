/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      // Phase M — Design system tokens.
      // `brand.*`, `surface.*`, `text.*`, and `state.*` are the canonical names
      // for new components; the legacy `custom-*` palette is preserved to avoid
      // breaking existing pages.
      colors: {
        brand: {
          50:  '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#3B82F6',
          500: '#134ECD',  // primary
          600: '#0B3D9C',
          700: '#062C7F',
          800: '#072364',
          900: '#1F2C37',
          950: '#0A1628',
        },
        accent: {
          400: '#F9D158',
          500: '#EAB308',
          600: '#CA8A04',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          muted:   '#F8FAFC',
          subtle:  '#F1F5F9',
          dark:    '#0F172A',
          'dark-2':'#111827',
        },
        text: {
          DEFAULT:  '#0F172A',
          muted:    '#475569',
          subtle:   '#94A3B8',
          inverted: '#FFFFFF',
        },
        state: {
          success: '#16A34A',
          warning: '#D97706',
          danger:  '#DC2626',
          info:    '#2563EB',
        },
        'custom-orange': '#EAB308',
        'custom-yellow': '#F9D158',
        'custom-dark-blue': '#1F2C37',
        'custom-dark-blue-2': '#111827',
        'custom-deep-blue': '#062C7F',
        'custom-sky-blue': '#134ECD',
        'custom-navy-blue': '#0B3D9C',
        'custom-white': '#FFFFFF',
        'custom-black': '#000000',
        'custom-light-blue': '#D4E9FF',
        'custom-light-gray': '#F5F5F5',
        'custom-gray': '#87949F',
        'custom-dark-gray': '#495B74',
        'custom-red': '#FF0000',
        'custom-green': '#00FF00',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto'],
      },
      borderRadius: {
        DEFAULT: '0.5rem',
        lg: '0.75rem',
        xl: '1rem',
      },
      boxShadow: {
        card: '0 1px 3px rgba(17, 24, 39, 0.06), 0 4px 12px rgba(17, 24, 39, 0.04)',
        'card-hover': '0 4px 6px rgba(17, 24, 39, 0.08), 0 12px 32px rgba(17, 24, 39, 0.10)',
      },
    },
  },
  plugins: [],
};
