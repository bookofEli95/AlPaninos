import type { Metadata, Viewport } from "next";
import { inter, jakarta } from "./fonts";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";
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
    <html lang="en-CA" className={`${inter.variable} ${jakarta.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
