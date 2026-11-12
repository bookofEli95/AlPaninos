"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import OrderableCard from "./ordering/orderable-card";
import OrderPanel from "./ordering/order-panel";

type Item = { id: string; name: string; description: string | null; base_price: number; image_url: string | null };
type Section = { category: { id: string; name: string }; items: Item[] };

// The menu as a website shows it: a category bar across the full width that
// stays under the header (the one being looked at underlined), search at
// its end, the items in a wide grid, and -- on big screens -- "Your Order"
// alongside.
export default function MenuBrowser({ sections, storeName, mode }: { sections: Section[]; storeName: string; mode: "pickup" | "delivery" }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(sections[0]?.category.id ?? "");

  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      q
        ? sections
            .map((s) => ({
              ...s,
              items: s.items.filter((i) => i.name.toLowerCase().includes(q) || (i.description ?? "").toLowerCase().includes(q)),
            }))
            .filter((s) => s.items.length > 0)
        : sections,
    [sections, q]
  );
  const resultCount = shown.reduce((n, s) => n + s.items.length, 0);

  // The section nearest the top of the screen is the active one.
  useEffect(() => {
    const headings = shown.map((s) => document.getElementById(s.category.id)).filter(Boolean) as HTMLElement[];
    if (headings.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-140px 0px -60% 0px" }
    );
    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [shown]);

  return (
    <>
      <nav aria-label="Menu categories" className="sticky top-[var(--header-height)] z-30 border-b border-stone-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-stretch gap-4 px-4 sm:px-6">
          <ul className="flex min-w-0 flex-1 items-stretch gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {shown.map(({ category }) => {
              const on = active === category.id;
              return (
                <li key={category.id} className="flex shrink-0">
                  <a
                    href={`#${category.id}`}
                    className={`flex items-center border-b-[3px] px-3 py-4 text-[13.5px] font-extrabold uppercase tracking-[0.06em] transition-colors ${
                      on ? "border-brand text-brand" : "border-transparent text-stone-600 hover:text-ink"
                    }`}
                  >
                    {category.name}
                  </a>
                </li>
              );
            })}
          </ul>
          <label className="relative hidden w-64 shrink-0 self-center md:block">
            <span className="sr-only">Search the menu</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the menu"
              className="w-full rounded-lg border border-stone-300 bg-white py-2 pl-9 pr-9 text-[14px] text-ink outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
            />
            {!!query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-stone-500 hover:bg-cream-deep"
                aria-label="Clear search"
              >
                <X className="size-4" />
              </button>
            )}
          </label>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:grid lg:grid-cols-[1fr_320px] lg:gap-10">
        <div>
          {/* Phones: search under the category bar */}
          <label className="relative mt-5 block md:hidden">
            <span className="sr-only">Search the menu</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the menu"
              className="w-full rounded-lg border border-stone-300 bg-white py-3 pl-9 pr-3 text-[15px] text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
            />
          </label>

          {q && (
            <p className="mt-6 text-sm font-semibold text-stone-500" aria-live="polite">
              {resultCount === 0 ? `Nothing matches "${query.trim()}".` : `${resultCount} ${resultCount === 1 ? "match" : "matches"} for "${query.trim()}"`}
            </p>
          )}

          <div id="menu-items" className="scroll-mt-32 space-y-14 pt-8">
            {shown.map(({ category, items }) => (
              <section key={category.id} aria-labelledby={`${category.id}-title`}>
                <div id={category.id} className="flex scroll-mt-32 items-baseline justify-between gap-3 border-b border-stone-200 pb-3">
                  <h2 id={`${category.id}-title`} className="font-display text-[1.9rem] font-extrabold tracking-tight text-ink">
                    {category.name}
                  </h2>
                  <span className="text-sm font-semibold text-stone-500">
                    {items.length} {items.length === 1 ? "item" : "items"}
                  </span>
                </div>
                <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3">
                  {items.map((item) => (
                    <OrderableCard key={item.id} item={item} sizes="(min-width: 1280px) 280px, (min-width: 768px) 30vw, 50vw" />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>

        {/* Big screens: the order, alongside the menu */}
        <aside className="hidden pt-8 lg:block" aria-label="Your order">
          <OrderPanel storeName={storeName} mode={mode} />
        </aside>
      </div>
    </>
  );
}
