/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      fontFamily: {
        'inter-medium': ['Inter_500Medium'],
        'inter-semibold': ['Inter_600SemiBold'],
        'inter-bold': ['Inter_700Bold'],
        'inter-extrabold': ['Inter_800ExtraBold'],
        // Headings, like the menu boards (and the website's stand-in for its
        // Adobe heading font, which is licensed for the web only).
        display: ['FjallaOne_400Regular'],
        'display-bold': ['FjallaOne_400Regular'],
      },
      colors: {
        brand: {
          red: '#A61C14',
          'red-dark': '#85140E',
          cream: '#F4ECE1',
          'cream-light': '#FAF6F0',
          dark: '#1C1917',
          muted: '#78716C',
        },
      },
    },
  },
  plugins: [],
};