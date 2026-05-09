/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        wa: {
          green: '#00a884',
          bgDark: '#111b21',
          panelDark: '#202c33',
          bubbleOut: '#005c4b',
          bubbleIn: '#202c33',
        },
      },
    },
  },
  plugins: [],
};
