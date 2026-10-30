import Link from "next/link";
import BrandMark from "./brand-mark";

const COLUMNS = [
  {
    title: "Order",
    links: [
      { href: "/menu", label: "Menu" },
      { href: "/#catering", label: "Catering" },
      { href: "/#rewards", label: "PaninoPoints" },
    ],
  },
  {
    title: "Visit",
    links: [
      { href: "/#locations", label: "Locations & Hours" },
      { href: "/support", label: "Customer Support" },
    ],
  },
  {
    title: "The Fine Print",
    links: [
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/terms", label: "Terms & Legal" },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className="grain bg-ink text-stone-400">
      <div className="mx-auto max-w-6xl px-4 pb-10 pt-14 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.3fr_repeat(3,1fr)]">
          <div>
            <BrandMark tone="light" />
            <p className="mt-4 max-w-xs text-sm leading-6">
              Toasted paninos, wraps and loaded fries, made to order in St. Thomas and London, Ontario.
            </p>
          </div>
          {COLUMNS.map((column) => (
            <div key={column.title}>
              <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">{column.title}</h2>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-[15px] font-medium text-cream-deep/90 transition-colors hover:text-gold">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} Al Paninos. All rights reserved.</p>
          <p>Proudly made in Ontario, Canada.</p>
        </div>
      </div>
    </footer>
  );
}
