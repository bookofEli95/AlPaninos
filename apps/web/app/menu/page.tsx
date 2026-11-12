import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Car, Flame, MapPin, Store, Users } from "lucide-react";
import MenuBrowser from "@/components/menu-browser";
import StoreStatus from "@/components/store-status";
import StoreSelect from "@/components/store-select";
import StoreSync from "@/components/ordering/store-sync";
import DeliveryAddressBar from "@/components/ordering/delivery-address-bar";
import { everydayMenu, getMenu, getStores, pickStore } from "@/lib/menu";

export const metadata: Metadata = {
  alternates: { canonical: "/menu" },
  title: "Menu",
  description: "Toasted paninos, wraps, sides and drinks from Al Paninos. Order ahead for pickup or delivery.",
};

// The full menu for one store (?store=<id>, otherwise the first), straight
// from the app's database; ?mode=delivery when they chose delivery.
export default async function MenuPage({ searchParams }: PageProps<"/menu">) {
  const { store: storeParam, mode: modeParam, address: addressParam } = await searchParams;
  const mode = modeParam === "delivery" ? "delivery" : "pickup";
  const stores = await getStores();
  const store = pickStore(stores, typeof storeParam === "string" ? storeParam : null);
  const menu = store ? await getMenu(store.id) : { categories: [], items: [] };
  const sections = everydayMenu(menu);
  const hasCatering = menu.categories.some((c) => c.is_catering);
  const href = (params: { store?: string; mode?: string }) =>
    `/menu?${new URLSearchParams({ store: params.store ?? store?.id ?? "", mode: params.mode ?? mode }).toString()}`;

  return (
    <>
      {store && (
        <StoreSync
          storeId={store.id}
          storeName={store.name}
          mode={mode}
          explicitStore={typeof storeParam === "string"}
          explicitMode={typeof modeParam === "string"}
          address={typeof addressParam === "string" ? addressParam : undefined}
        />
      )}
      {/* ---- Page banner: what you're ordering, and from where ---------- */}
      <section className="bg-ink text-white">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 md:py-12">
          <nav aria-label="Breadcrumb" className="text-[13px] text-stone-400">
            <Link href="/" className="hover:text-white">
              Home
            </Link>
            <span className="mx-2">/</span>
            <span className="text-white">Menu</span>
          </nav>
          <div className="mt-4 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="font-display text-5xl font-extrabold tracking-tight sm:text-6xl">Menu</h1>
              {store && (
                <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px] text-stone-300">
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-4 text-gold" aria-hidden />
                    {store.name}
                    {store.address ? `, ${store.address.split(",")[0]}` : ""}
                  </span>
                  <StoreStatus hours={store.hours} tone="dark" />
                </p>
              )}
            </div>

            {/* Pickup or delivery, and the store -- as a website order bar */}
            <div className="grid gap-3 sm:grid-cols-2 lg:w-[34rem]">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-400">Order type</p>
                <div className="mt-1.5 grid grid-cols-2 overflow-hidden rounded-lg ring-1 ring-white/20">
                  {(
                    [
                      { key: "pickup", label: "Pickup", Icon: Store },
                      { key: "delivery", label: "Delivery", Icon: Car },
                    ] as const
                  ).map(({ key, label, Icon }) => {
                    const on = mode === key;
                    return (
                      <Link
                        key={key}
                        href={href({ mode: key })}
                        aria-current={on ? "true" : undefined}
                        className={`flex items-center justify-center gap-1.5 py-3 text-[13px] font-extrabold uppercase tracking-wide transition-colors ${
                          on ? "bg-white text-ink" : "text-stone-300 hover:bg-white/10"
                        }`}
                      >
                        <Icon className="size-4" aria-hidden />
                        {label}
                      </Link>
                    );
                  })}
                </div>
              </div>
              {store && stores.length > 1 && (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-400">Store</p>
                  <div className="mt-1.5">
                    <StoreSelect stores={stores.map((s) => ({ id: s.id, name: s.name }))} current={store.id} mode={mode} />
                  </div>
                </div>
              )}
            </div>
          </div>
          {mode === "delivery" && <DeliveryAddressBar />}
        </div>
      </section>

      {sections.length > 0 ? (
        <MenuBrowser sections={sections} storeName={store?.name ?? ""} mode={mode} />
      ) : (
        <p className="mx-auto max-w-7xl px-4 py-20 text-center text-stone-500 sm:px-6">The menu is being updated. Check back soon.</p>
      )}

      {/* ---- More ways to order ------------------------------------------ */}
      <section className="border-t border-stone-200 bg-cream">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 py-12 sm:px-6 md:grid-cols-2">
          {hasCatering && (
            <Link href="/catering" className="group flex items-center gap-5 rounded-xl bg-brand p-6 text-white">
              <Users className="size-9 shrink-0 text-gold" aria-hidden />
              <span className="flex-1">
                <span className="block font-display text-xl font-extrabold">Catering for a crowd</span>
                <span className="block text-[15px] text-white/80">Six spreads, priced per person. Order by 6 PM for the next day.</span>
              </span>
              <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" aria-hidden />
            </Link>
          )}
          <div className="flex items-center gap-5 rounded-xl bg-ink p-6 text-white">
            <Flame className="size-9 shrink-0 text-blush" aria-hidden />
            <span className="flex-1">
              <span className="block font-display text-xl font-extrabold">The Secret Mob</span>
              <span className="block text-[15px] text-stone-400">Limited drops, only in the Al Paninos app.</span>
            </span>
          </div>
        </div>
      </section>
    </>
  );
}
