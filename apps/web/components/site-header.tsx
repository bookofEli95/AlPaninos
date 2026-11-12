import Link from "next/link";
import MobileNav from "./mobile-nav";
import BrandMark from "./brand-mark";
import { HeaderAccount, HeaderCart, HeaderOrderNow, HeaderStore } from "./header-ordering";

const NAV = [
  { href: "/menu", label: "Menu" },
  { href: "/deals", label: "Deals" },
  { href: "/catering", label: "Catering" },
  { href: "/rewards", label: "Rewards" },
  { href: "/locations", label: "Locations" },
];

// A website header, not an app bar: a thin top strip (stores, help, sign
// in, join), then the main bar -- the brand, the sections in bold capitals,
// the store you're ordering from, your order, and Order Now. Only the main
// bar stays on screen as you scroll.
export default function SiteHeader() {
  return (
    <>
      <div className="hidden bg-ink text-[13px] text-stone-300 md:block">
        <div className="mx-auto flex h-9 max-w-7xl items-center justify-between px-6">
          <p>Order ahead for pickup or delivery in St. Thomas &amp; London, Ontario</p>
          <nav aria-label="Account" className="flex items-center gap-5">
            <Link href="/locations" className="hover:text-white">
              Find a Store
            </Link>
            <Link href="/support" className="hover:text-white">
              Help
            </Link>
            <span aria-hidden className="h-3.5 w-px bg-white/20" />
            <HeaderAccount variant="strip" />
          </nav>
        </div>
      </div>

      <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-[var(--header-height)] max-w-7xl items-center gap-3 px-4 sm:gap-6 sm:px-6 lg:gap-8">
          <BrandMark />

          <nav aria-label="Main" className="hidden h-full items-stretch lg:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center border-b-[3px] border-transparent px-3 pt-[3px] text-[14px] font-extrabold uppercase tracking-[0.06em] text-ink transition-colors hover:border-brand hover:text-brand"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <HeaderStore />
            <HeaderAccount />
            <HeaderCart />
            <HeaderOrderNow className="hidden whitespace-nowrap rounded-lg bg-brand px-5 py-3 text-sm font-extrabold uppercase tracking-wide text-white transition-colors hover:bg-brand-dark sm:block" />

            <MobileNav links={[...NAV, { href: "/support", label: "Help" }]} />
          </div>
        </div>
      </header>
    </>
  );
}
