"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import ItemCard from "./item-card";

type Item = { id: string; name: string; description: string | null; base_price: number; image_url: string | null };
type Section = { category: { id: string; name: string }; items: Item[] };

// The menu, a section per category, with a search box and a list of the
// categories that stays in view (a sidebar on wide screens, a row of chips
// on phones) and highlights the one being looked at.
export default function MenuBrowser({ sections }: { sections: Section[] }) {
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
      { rootMargin: "-120px 0px -60% 0px" }
    );
    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [shown]);

  const searchBox = (
    <label className="relative block">
      <span className="sr-only">Search the menu</span>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-stone-400" aria-hidden />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search the menu"
        className="w-full rounded-full border border-stone-300 bg-white py-2.5 pl-10 pr-10 text-[15px] text-ink outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10"
      />
      {!!query && (
        <button
          type="button"
          onClick={() => setQuery("")}
          className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-stone-500 hover:bg-cream-deep"
          aria-label="Clear search"
        >
          <X className="size-4" />
        </button>
      )}
    </label>
  );

  return (
    <div className="lg:grid lg:grid-cols-[230px_1fr] lg:gap-10">
      {/* Wide screens: search and categories down the side */}
      <aside className="hidden lg:block">
        <div className="sticky top-[calc(var(--header-height)+1.5rem)] space-y-5">
          {searchBox}
          <nav aria-label="Menu categories">
            <ul className="space-y-1">
              {shown.map(({ category, items }) => {
                const on = active === category.id;
                return (
                  <li key={category.id}>
                    <a
                      href={`#${category.id}`}
                      className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-[15px] font-semibold transition-colors ${
                        on ? "bg-ink text-cream-deep" : "text-stone-700 hover:bg-cream-deep"
                      }`}
                    >
                      {category.name}
                      <span className={`text-xs tabular-nums ${on ? "text-stone-400" : "text-stone-400"}`}>{items.length}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </aside>

      <div>
        {/* Phones and tablets: search, then the categories as chips that stay in view */}
        <div className="lg:hidden">{searchBox}</div>
        <nav
          aria-label="Menu categories"
          className="sticky top-[var(--header-height)] z-30 -mx-4 mt-3 border-b border-stone-200/70 bg-cream/90 px-4 py-2.5 backdrop-blur-md sm:-mx-6 sm:px-6 lg:hidden"
        >
          <ul className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {shown.map(({ category }) => {
              const on = active === category.id;
              return (
                <li key={category.id} className="shrink-0">
                  <a
                    href={`#${category.id}`}
                    className={`block rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                      on ? "border-ink bg-ink text-cream-deep" : "border-stone-300 bg-white text-ink"
                    }`}
                  >
                    {category.name}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        {q && (
          <p className="mt-6 text-sm font-semibold text-stone-500" aria-live="polite">
            {resultCount === 0 ? `Nothing matches "${query.trim()}".` : `${resultCount} ${resultCount === 1 ? "match" : "matches"} for "${query.trim()}"`}
          </p>
        )}

        <div className="mt-6 space-y-14 lg:mt-0">
          {shown.map(({ category, items }) => (
            <section key={category.id} aria-labelledby={`${category.id}-title`}>
              <div id={category.id} className="flex scroll-mt-16 items-baseline justify-between gap-3 lg:scroll-mt-2">
                <h2 id={`${category.id}-title`} className="font-display text-[1.75rem] font-extrabold tracking-tight text-ink">
                  {category.name}
                </h2>
                <span className="text-sm font-semibold text-stone-400">
                  {items.length} {items.length === 1 ? "item" : "items"}
                </span>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3">
                {items.map((item) => (
                  <ItemCard key={item.id} item={item} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
