/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js}'],
  theme: {
    extend: {
      colors: {
        appbg: '#F5F5F7',
        cardbg: '#FFFFFF',
        primary: '#0066CC',
        success: '#34C759',
        danger: '#FF3B30',
        warning: '#FF9500',
        purple: '#AF52DE',
        teal: '#5AC8FA',
      },
      borderRadius: {
        apple: '18px',
      },
    },
  },
  plugins: [],
}
