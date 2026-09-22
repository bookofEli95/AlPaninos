/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      fontFamily: {
        // Custom fonts in React Native are each their own single-weight
        // font file -- fontWeight on a custom fontFamily does nothing, so
        // NativeWind's font-bold/extrabold/semibold/medium classes (weight
        // only) are paired with one of these (family) wherever they're
        // used, rather than a single global default -- there's no reliable
        // "set the default font for every Text" hook in this stack (RN 0.86
        // /React 19 removed the forwardRef trick; a custom Text wrapper
        // would silently break NativeWind's className handling, which is
        // keyed by exact component reference -- see react-native-css-interop).
        'inter-medium': ['Inter_500Medium'],
        'inter-semibold': ['Inter_600SemiBold'],
        'inter-bold': ['Inter_700Bold'],
        'inter-extrabold': ['Inter_800ExtraBold'],
        // For headlines/brand moments only (wordmark, category tiles, the
        // wheel) -- a bolder, more playful face than the Inter pairs above.
        display: ['Fredoka_600SemiBold'],
        'display-bold': ['Fredoka_700Bold'],
      },
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
