/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/client/index.html',
    './src/client/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        swiss: {
          red: '#D52B1E',
          dark: '#1A202C',
        },
      },
    },
  },
  plugins: [],
};
