import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      colors: {
        ivory: {
          50: '#FFFEFA',
          100: '#FFFDF4',
          200: '#FCFAEC',
          300: '#F7F3DD',
          400: '#F0ECD0',
          500: '#E7E3C2',
          600: '#D6D1AD',
          700: '#BDB895',
          800: '#9E9A78',
          900: '#7E7A5E',
        },
        saffron: {
          50: '#FFF8E6',
          100: '#FFEFC2',
          200: '#FFE18A',
          300: '#FFD155',
          400: '#FFC12B',
          500: '#F2B320',
          600: '#D99E1A',
          700: '#B88315',
          800: '#946912',
          900: '#78550E',
        },
        ink: {
          50: '#F6F7F8',
          100: '#EDEFF1',
          200: '#DBE0E5',
          300: '#B7C0CB',
          400: '#8E9AA8',
          500: '#6B7280',
          600: '#4B5563',
          700: '#374151',
          800: '#1F2937',
          900: '#0B1220',
        },
      },
      container: {
        center: true,
        padding: '1rem',
        screens: {
          '2xl': '1200px',
        },
      },
    },
  },
  plugins: [],
}

export default config


