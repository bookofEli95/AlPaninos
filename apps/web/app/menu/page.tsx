import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Flame, MapPin, Users } from "lucide-react";
import MenuBrowser from "@/components/menu-browser";
import StoreStatus from "@/components/store-status";
import { everydayMenu, getMenu, getStores, pickStore } from "@/lib/menu";

export const metadata: Metadata = {
  title: "Menu",
  description: "Toasted paninos, wraps, sides and drinks from Al Paninos. Order ahead for pickup or delivery.",
};

// The full menu for one store (?store=<id>, otherwise the first), straight
// from the app's database.
export default async function MenuPage({ searchParams }: PageProps<"/menu">) {
  const { store: storeParam } = await searchParams;
  const stores = await getStores();
  const store = pickStore(stores, typeof storeParam === "string" ? storeParam : null);
  const menu = store ? await getMenu(store.id) : { categories: [], items: [] };
  const sections = everydayMenu(menu);
  const hasCatering = menu.categories.some((c) => c.is_catering);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-20 pt-10 sm:px-6 md:pt-14">
      <div className="flex flex-col gap-6 border-b border-stone-200 pb-8 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-brand">Order online</p>
          <h1 className="mt-2 font-display text-[2.6rem] font-extrabold leading-none tracking-tight text-ink sm:text-6xl">Our Menu</h1>
          {store && (
            <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-stone-600">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-4 text-brand" aria-hidden />
                {store.name}
              </span>
              <StoreStatus hours={store.hours} />
            </p>
          )}
        </div>

        {stores.length > 1 && (
          <div className="flex w-full rounded-full border border-stone-300 bg-white p-1 md:inline-flex md:w-auto" role="tablist" aria-label="Store">
            {stores.map((s) => {
              const on = s.id === store?.id;
              return (
                <Link
                  key={s.id}
                  href={`/menu?store=${s.id}`}
                  role="tab"
                  aria-selected={on}
                  className={`flex-1 whitespace-nowrap rounded-full px-3 py-2 text-center text-[13px] font-bold transition-colors sm:px-4 sm:text-sm md:flex-none ${on ? "bg-brand text-cream-deep shadow-sm" : "text-stone-600 hover:text-ink"}`}
                >
                  {s.name}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {hasCatering && (
          <Link
            href="/catering"
            className="group flex items-center gap-4 rounded-2xl border border-brand/25 bg-white p-4 transition-colors hover:border-brand"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
              <Users className="size-5" aria-hidden />
            </span>
            <span className="flex-1">
              <span className="block font-bold text-ink">Catering for a crowd?</span>
              <span className="block text-sm text-stone-500">Boards and party packs. Order by 6 PM for next day.</span>
            </span>
            <ArrowRight className="size-5 text-brand transition-transform group-hover:translate-x-1" aria-hidden />
          </Link>
        )}
        <div className="flex items-center gap-4 rounded-2xl bg-ink p-4 text-cream-deep">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/10">
            <Flame className="size-5 text-blush" aria-hidden />
          </span>
          <span className="flex-1">
            <span className="block font-bold">The Secret Mob</span>
            <span className="block text-sm text-stone-400">Limited drops, only in the Al Paninos app.</span>
          </span>
        </div>
      </div>

      <div className="mt-10">
        {sections.length > 0 ? (
          <MenuBrowser sections={sections} />
        ) : (
          <p className="rounded-2xl bg-white p-8 text-center text-stone-500">The menu is being updated. Check back soon.</p>
        )}
      </div>
    </div>
  );
}
