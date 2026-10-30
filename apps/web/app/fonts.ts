import localFont from "next/font/local";

// The app's own fonts (Inter for text, Plus Jakarta Sans for headings),
// served from the site itself -- Latin-only, as woff2.
export const inter = localFont({
  src: [
    { path: "./fonts/Inter_400Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/Inter_500Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/Inter_600SemiBold.woff2", weight: "600", style: "normal" },
    { path: "./fonts/Inter_700Bold.woff2", weight: "700", style: "normal" },
    { path: "./fonts/Inter_800ExtraBold.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-inter",
  display: "swap",
});

export const jakarta = localFont({
  src: [
    { path: "./fonts/PlusJakartaSans_700Bold.woff2", weight: "700", style: "normal" },
    { path: "./fonts/PlusJakartaSans_800ExtraBold.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-jakarta",
  display: "swap",
});
