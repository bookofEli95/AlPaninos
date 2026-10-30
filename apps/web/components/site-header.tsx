import Link from "next/link";
import { ArrowRight, Menu as MenuIcon } from "lucide-react";
import BrandMark from "./brand-mark";

const LINKS = [
  { href: "/menu", label: "Menu" },
  { href: "/#catering", label: "Catering" },
  { href: "/#rewards", label: "Rewards" },
  { href: "/#locations", label: "Locations" },
];

// Sticky across the top of every page: the brand, the main links, and the
// one thing most visitors came for -- Order Now.
export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-stone-200/70 bg-cream/85 backdrop-blur-md supports-[backdrop-filter]:bg-cream/75">
      <div className="mx-auto flex h-[var(--header-height)] max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <BrandMark />

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-3.5 py-2 text-[15px] font-semibold text-stone-700 transition-colors hover:bg-cream-deep hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/menu"
            className="group inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2.5 text-sm font-bold text-cream-deep shadow-sm shadow-brand/20 transition-colors hover:bg-brand-dark sm:px-5"
          >
            Order Now
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>

          {/* Phones: the links behind a button, no script needed. */}
          <details className="group relative md:hidden">
            <summary
              className="flex size-10 cursor-pointer list-none items-center justify-center rounded-full border border-stone-300 bg-white text-ink [&::-webkit-details-marker]:hidden"
              aria-label="Open menu"
            >
              <MenuIcon className="size-5" aria-hidden />
            </summary>
            <nav
              aria-label="Main"
              className="absolute right-0 top-12 w-56 rounded-2xl border border-stone-200 bg-white p-2 shadow-xl shadow-black/10"
            >
              {LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block rounded-xl px-3.5 py-3 text-[15px] font-semibold text-ink hover:bg-cream"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
