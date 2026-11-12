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
    default: "Al Paninos | Toasted Paninos, Wraps & Catering",
    template: "%s | Al Paninos",
  },
  description:
    "Toasted paninos, wraps, loaded fries and catering in St. Thomas and London, Ontario. Order ahead for pickup or delivery and earn PaninoPoints on every order.",
  openGraph: {
    type: "website",
    siteName: "Al Paninos",
    locale: "en_CA",
    images: [{ url: "/media/hero-poster.jpg", width: 720, height: 1280, alt: "A crispy chicken panino with fries" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#a61c14",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-CA" className={`${inter.variable} ${fjalla.variable}`}>
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
