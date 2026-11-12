import localFont from "next/font/local";

// The site's fonts, served from the site itself (Latin-only woff2): Inter
// for text, Fjalla One for headings -- tall and narrow like the menu boards
// (until the brand's own heading font is in).
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

// One weight, already heavy: it stands for every weight, so headings marked
// bold aren't thickened again by the browser.
export const fjalla = localFont({
  src: [{ path: "./fonts/FjallaOne_400Regular.woff2", weight: "400 900", style: "normal" }],
  variable: "--font-fjalla",
  display: "swap",
});
