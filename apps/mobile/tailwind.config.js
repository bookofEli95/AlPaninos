/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        brand: {
          red: '#A61C14',         // Primary crimson background
          'red-dark': '#85140E',    // Darker crimson for active/pressed states
          cream: '#F4ECE1',       // Warm cream parchment for text/ring
          'cream-light': '#FAF6F0', // Very soft cream for card surfaces
          dark: '#1C1917',        // Rich charcoal body/heading text
          muted: '#78716C',       // Neutral stone for secondary details
        },
      },
    },
  },
  plugins: [],
};
