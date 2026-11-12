import Link from "next/link";
import { Smartphone } from "lucide-react";
import BrandMark from "./brand-mark";

const COLUMNS = [
  {
    title: "Order",
    links: [
      { href: "/menu", label: "Full Menu" },
      { href: "/deals", label: "Deals & Offers" },
      { href: "/catering", label: "Catering" },
      { href: "/locations", label: "Pickup & Delivery" },
    ],
  },
  {
    title: "PaninoPoints",
    links: [
      { href: "/rewards", label: "How It Works" },
      { href: "/join", label: "Join for Free" },
      { href: "/signin", label: "Sign In" },
    ],
  },
  {
    title: "Al Paninos",
    links: [
      { href: "/locations", label: "Locations & Hours" },
      { href: "/support", label: "Customer Support" },
      { href: "/catering", label: "Office & Event Catering" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/terms", label: "Terms & Legal" },
    ],
  },
];

// A full website footer: the brand with a way to order, four columns of
// links, the app on its way, and the legal line.
export default function SiteFooter() {
  return (
    <footer className="bg-ink text-stone-400">
      <div className="mx-auto max-w-7xl px-4 pt-16 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_repeat(4,1fr)] lg:gap-8">
          <div>
            <BrandMark tone="light" />
            <p className="mt-5 max-w-xs text-[15px] leading-7">
              Toasted paninos, wraps and loaded fries, made to order in St. Thomas and London, Ontario.
            </p>
            <Link
              href="/menu"
              className="mt-6 inline-flex rounded-lg bg-brand px-5 py-3 text-sm font-extrabold uppercase tracking-wide text-white transition-colors hover:bg-brand-dark"
            >
              Order Now
            </Link>
          </div>
          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-white">{column.title}</h2>
              <ul className="mt-5 space-y-3">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className="text-[15px] transition-colors hover:text-gold">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-4 rounded-xl bg-white/[0.05] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Smartphone className="size-6 text-gold" aria-hidden />
            <p className="text-[15px] text-stone-300">
              <span className="font-bold text-white">The Al Paninos app</span> is coming soon to iPhone and Android, with the
              spin wheel and Secret Mob drops.
            </p>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center gap-2 border-t border-white/10 py-6 text-center text-[13px] sm:grid sm:grid-cols-[1fr_auto_1fr] sm:gap-6 sm:text-left">
          <p>&copy; {new Date().getFullYear()} Al Paninos. All rights reserved.</p>
          <span role="img" aria-label="Goat" className="text-[20px] leading-none">
            🐐
          </span>
          <p className="sm:text-right">Proudly made in Ontario, Canada.</p>
        </div>
      </div>
    </footer>
  );
}
