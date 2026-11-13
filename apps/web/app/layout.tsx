import type { Metadata, Viewport } from "next";
import { fjalla, inter } from "./fonts";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";
import OrderingProvider from "@/components/ordering/ordering-provider";
import SiteChrome from "@/components/site-chrome";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://alpaninos.com"),
  title: {
    default: "Al Panino's | Toasted Paninos, Wraps & Catering",
    template: "%s | Al Panino's",
  },
  description:
    "Toasted paninos, wraps, loaded fries and catering in St. Thomas and London, Ontario. Order ahead for pickup or delivery and earn PaninoPoints on every order.",
  openGraph: {
    type: "website",
    siteName: "Al Panino's",
    locale: "en_CA",
    images: [{ url: "/media/og.jpg", width: 1200, height: 630, alt: "Al Panino's: Pressed hot. Stacked high. Toasted paninos, wraps and catering in St. Thomas and London, Ontario." }],
  },
  // The big picture card when a link is shared (texts, Facebook, X).
  twitter: { card: "summary_large_image", images: ["/media/og.jpg"] },
};

export const viewport: Viewport = {
  themeColor: "#a61c14",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-CA" className={`${inter.variable} ${fjalla.variable}`}>
      <head>
        {/* The brand's Adobe fonts (Contempora Sans Condensed, Sweet Sans Pro). */}
        <link rel="preconnect" href="https://use.typekit.net" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://use.typekit.net/wgm2csw.css" />
      </head>
      <body className="flex min-h-dvh flex-col">
        <OrderingProvider>
          <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[80] focus:rounded-lg focus:bg-ink focus:px-4 focus:py-3 focus:text-white">
            Skip to content
          </a>
          <SiteChrome header={<SiteHeader />} footer={<SiteFooter />}>
            {children}
          </SiteChrome>
        </OrderingProvider>
      </body>
    </html>
  );
}
