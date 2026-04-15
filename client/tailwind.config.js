/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        'neon-yellow': '#FFE500',
        'neon-orange': '#FF6B00',
        surface:       '#0F0F0F',
        'surface-2':   '#1A1A1A',
        'surface-3':   '#2A2A2A',
      },
      boxShadow: {
        neon: '0 0 20px rgba(255,229,0,0.4)',
        sos:  '0 0 30px rgba(239,68,68,0.6)',
      },
      keyframes: {
        'fade-in-out': {
          '0%':   { opacity: 0, transform: 'translateX(-50%) translateY(-6px)' },
          '15%':  { opacity: 1, transform: 'translateX(-50%) translateY(0)' },
          '75%':  { opacity: 1, transform: 'translateX(-50%) translateY(0)' },
          '100%': { opacity: 0, transform: 'translateX(-50%) translateY(-6px)' },
        },
      },
      animation: {
        'fade-in-out': 'fade-in-out 3.5s ease forwards',
      },
    },
  },
  plugins: [],
};
