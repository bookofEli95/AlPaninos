import Link from "next/link";
import { ChevronDown, Menu as MenuIcon, Store } from "lucide-react";
import BrandMark from "./brand-mark";

const NAV = [
  { href: "/menu", label: "Menu" },
  { href: "/#deals", label: "Deals" },
  { href: "/#catering", label: "Catering" },
  { href: "/#rewards", label: "Rewards" },
  { href: "/#locations", label: "Locations" },
];

// A website header, not an app bar: a thin top strip (stores, sign in,
// join), then the main bar -- the brand, the sections in bold capitals,
// the store you're ordering from, and Order Now. Only the main bar stays
// on screen as you scroll.
export default function SiteHeader() {
  return (
    <>
      <div className="hidden bg-ink text-[13px] text-stone-300 md:block">
        <div className="mx-auto flex h-9 max-w-7xl items-center justify-between px-6">
          <p>Order ahead for pickup or delivery in St. Thomas &amp; London, Ontario</p>
          <nav aria-label="Account" className="flex items-center gap-5">
            <Link href="/#locations" className="hover:text-white">
              Find a Store
            </Link>
            <Link href="/support" className="hover:text-white">
              Help
            </Link>
            <span aria-hidden className="h-3.5 w-px bg-white/20" />
            <Link href="/signin" className="font-semibold text-white hover:text-gold">
              Sign In
            </Link>
            <Link href="/join" className="font-semibold text-gold hover:text-white">
              Join PaninoPoints
            </Link>
          </nav>
        </div>
      </div>

      <header className="sticky top-0 z-40 border-b border-stone-200 bg-white">
        <div className="mx-auto flex h-[var(--header-height)] max-w-7xl items-center gap-3 px-4 sm:gap-6 sm:px-6 lg:gap-10">
          <BrandMark />

          <nav aria-label="Main" className="hidden h-full items-stretch lg:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center border-b-[3px] border-transparent px-3.5 pt-[3px] text-[14px] font-extrabold uppercase tracking-[0.06em] text-ink transition-colors hover:border-brand hover:text-brand"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <Link
              href="/#locations"
              className="hidden items-center gap-2.5 rounded-lg border border-stone-300 py-1.5 pl-3 pr-2.5 transition-colors hover:border-ink md:flex"
            >
              <Store className="size-4 text-brand" aria-hidden />
              <span className="text-left leading-tight">
                <span className="block text-[11px] font-bold uppercase tracking-wide text-stone-500">Ordering from</span>
                <span className="block text-sm font-bold text-ink">Choose a store</span>
              </span>
              <ChevronDown className="size-4 text-stone-500" aria-hidden />
            </Link>
            <Link
              href="/menu"
              className="whitespace-nowrap rounded-lg bg-brand px-3.5 py-3 text-[13px] font-extrabold uppercase tracking-wide text-white transition-colors hover:bg-brand-dark sm:px-5 sm:text-sm"
            >
              Order Now
            </Link>

            {/* Phones and tablets: the sections behind a button, no script needed. */}
            <details className="relative lg:hidden">
              <summary
                className="flex size-11 cursor-pointer list-none items-center justify-center rounded-lg border border-stone-300 text-ink [&::-webkit-details-marker]:hidden"
                aria-label="Open menu"
              >
                <MenuIcon className="size-5" aria-hidden />
              </summary>
              <nav
                aria-label="Main"
                className="absolute right-0 top-14 w-64 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xl shadow-black/10"
              >
                {NAV.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="block border-b border-stone-100 px-5 py-3.5 text-sm font-extrabold uppercase tracking-wide text-ink hover:bg-cream"
                  >
                    {item.label}
                  </Link>
                ))}
                <div className="grid grid-cols-2 gap-2 p-3">
                  <Link href="/signin" className="rounded-lg border border-stone-300 py-2.5 text-center text-sm font-bold text-ink">
                    Sign In
                  </Link>
                  <Link href="/join" className="rounded-lg bg-ink py-2.5 text-center text-sm font-bold text-gold">
                    Join
                  </Link>
                </div>
              </nav>
            </details>
          </div>
        </div>
      </header>
    </>
  );
}
