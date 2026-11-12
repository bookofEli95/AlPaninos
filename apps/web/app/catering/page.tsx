import type { Metadata } from "next";
import RedPhoto from "@/components/brand/red-photo";
import Link from "next/link";
import { ArrowRight, BadgeCheck, CalendarClock, ChefHat, ClipboardList, HandPlatter, Leaf, MessageCircleQuestion, Phone, PhoneCall, Receipt, ShieldAlert, Truck, UtensilsCrossed } from "lucide-react";
import CateringOrder, { PackageCards } from "@/components/catering/catering-order";
import JumpLink from "@/components/jump-link";
import { getStores, pickStore } from "@/lib/menu";
import { getCateringPackages, getSandwichDescriptions, type CateringPackage } from "@/lib/catering-menu";
import { CATERING_MAX_DELIVERY_KM } from "@/lib/ordering/catering";
import { money, tidyDescription } from "@/lib/format";

export const revalidate = 300;

export const metadata: Metadata = {
  alternates: { canonical: "/catering" },
  title: "Catering",
  description: `Al Paninos catering in St. Thomas and London, Ontario. Six spreads from $18.50 a person: sandwich luncheons, build-your-own paninos, tacos, pasta, Texas BBQ and Greek. No minimum, order by 6 PM for tomorrow, free delivery within ${CATERING_MAX_DELIVERY_KM} km.`,
};

const STEPS = [
  { Icon: ClipboardList, title: "Pick your spread", text: "Six packages, priced per person. Or tell Al Panino's exactly what you're after." },
  { Icon: UtensilsCrossed, title: "Make it yours", text: "Headcount, salad and dessert upgrades, drinks, cutlery. Your total updates as you go." },
  { Icon: PhoneCall, title: "Al Panino's calls to confirm", text: "We go over every detail with you before anything hits the press. No emailing forms back and forth." },
  { Icon: HandPlatter, title: "Mangia!", text: "Picked up or delivered right on time, made fresh that day." },
];

const GOOD_TO_KNOW = [
  { Icon: ChefHat, text: "Everything is made fresh to order, the day of your event." },
  { Icon: CalendarClock, text: "Order by 6 PM for the next day, up to two weeks ahead. Custom orders need 48 hours' notice." },
  { Icon: Leaf, text: "Vegetarian, gluten-free and allergy orders are wrapped and labelled separately." },
  { Icon: BadgeCheck, text: "All of our chicken is halal." },
  { Icon: Truck, text: `Free delivery within ${CATERING_MAX_DELIVERY_KM} km of the store.` },
  { Icon: Receipt, text: "Ordering for work? Add your company, a PO number and where the invoice goes. You pay at pickup or delivery." },
];

// Groups shared by the packages, read straight from the menu (so the
// prices here are always the ones charged).
function menuGroups(packages: CateringPackage[]) {
  const find = (re: RegExp) => packages.flatMap((p) => p.groups).find((g) => re.test(g.name));
  const salad = find(/^salad$/i);
  const dessert = find(/^dessert$/i);
  const addons = find(/add-ons/i);
  const favourites = find(/favourites/i);
  const split = (g?: CateringPackage["groups"][number]) => ({
    standard: g?.options.filter((o) => Number(o.price_adjustment) === 0).map((o) => o.name) ?? [],
    upgrades: g?.options.filter((o) => Number(o.price_adjustment) > 0) ?? [],
  });
  return { salad: split(salad), dessert: split(dessert), addons: addons?.options ?? [], sandwiches: favourites?.options.map((o) => o.name) ?? [] };
}

export default async function CateringPage({ searchParams }: PageProps<"/catering">) {
  const { store: storeParam } = await searchParams;
  const stores = await getStores();
  const store = pickStore(stores, typeof storeParam === "string" ? storeParam : null);
  const packages = await getCateringPackages(stores.map((s) => s.id));
  const here = packages.filter((p) => p.location_id === store?.id);
  const menu = menuGroups(here);
  const descriptions = store ? await getSandwichDescriptions(store.id, menu.sandwiches) : {};
  const from = here.length ? Math.min(...here.map((p) => p.base_price)) : null;
  const phone = store?.phone ?? null;

  return (
    <>
      {/* ---- Opener ------------------------------------------------------ */}
      <section className="relative overflow-hidden bg-ink text-white">
        <div className="grid lg:min-h-[560px] lg:grid-cols-2">
          <div className="relative aspect-[16/10] sm:aspect-[16/8] lg:order-2 lg:aspect-auto">
            <RedPhoto src="/media/focaccia.jpg" alt="A stack of fresh focaccia outside the shop" sizes="(min-width: 1024px) 50vw, 100vw" priority position="50% 62%" />
            <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink via-ink/10 to-transparent lg:bg-gradient-to-r lg:from-ink lg:via-ink/0" />
            <span className="absolute bottom-5 right-5 hidden -rotate-2 rounded-md bg-gold px-3.5 py-2 text-[13px] font-extrabold uppercase tracking-wide text-wine shadow-lg sm:block">No minimum</span>
          </div>
          <div className="relative flex items-center lg:order-1">
            <div className="w-full px-4 pb-12 pt-2 sm:px-6 lg:ml-auto lg:max-w-[640px] lg:py-16 lg:pr-14">
              <nav aria-label="Breadcrumb" className="text-[13px] text-stone-400">
                <Link href="/" className="hover:text-white">
                  Home
                </Link>
                <span className="mx-2">/</span>
                <span className="text-white">Catering</span>
              </nav>
              <p className="mt-5 text-[13px] font-extrabold font-accent uppercase tracking-[0.18em] text-gold">Catering by Al Panino&apos;s</p>
              <h1 className="mt-3 font-display text-[2.75rem] font-extrabold leading-[1] tracking-tight sm:text-6xl">Feed the whole famiglia.</h1>
              <p className="mt-5 max-w-md text-lg leading-8 text-stone-300">
                Paninos, pasta, tacos, Texas BBQ and Greek, made fresh for the office, the party or game day.
                {from != null && <> From {money(from)} a person.</>}
              </p>
              <ul className="mt-6 flex flex-wrap gap-2 text-[13px] font-bold">
                {["No minimum", "Order by 6 PM for tomorrow", `Free delivery within ${CATERING_MAX_DELIVERY_KM} km`].map((t) => (
                  <li key={t} className="rounded-full bg-white/10 px-3 py-1.5 ring-1 ring-white/15">
                    {t}
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-wrap gap-3">
                <JumpLink to="order" className="inline-flex items-center gap-2 rounded-lg bg-brand px-7 py-4 text-[15px] font-extrabold uppercase tracking-wide text-white shadow-lg shadow-black/30 hover:bg-brand-dark">
                  Start Your Order
                  <ArrowRight className="size-4" aria-hidden />
                </JumpLink>
                {here.length > 0 && (
                  <JumpLink to="packages" className="inline-flex items-center rounded-lg px-6 py-4 text-[15px] font-extrabold uppercase tracking-wide text-white ring-1 ring-white/30 hover:bg-white/10">
                    See the Spreads
                  </JumpLink>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---- How it works ------------------------------------------------- */}
      <section aria-labelledby="how" className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
          <h2 id="how" className="text-[13px] font-extrabold font-accent uppercase tracking-[0.18em] text-brand">
            How it works
          </h2>
          <ol className="mt-6 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(({ Icon, title, text }, i) => (
              <li key={title} className="relative">
                <div className="flex items-center gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-ink font-display text-lg font-extrabold text-gold">{i + 1}</span>
                  <Icon className="size-5 text-brand" aria-hidden />
                </div>
                <p className="mt-4 font-display text-xl font-extrabold text-ink">{title}</p>
                <p className="mt-1.5 text-[15px] leading-6 text-stone-600">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {here.length === 0 ? (
        // No packages loaded (the catering menu update isn't in the
        // database): "Start Your Order" lands here, on how to order.
        <section id="order" className="scroll-mt-20 bg-cream">
          <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
            <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
              <div className="grain bg-ink px-6 py-5 text-white sm:px-8">
                <p className="text-[12px] font-extrabold font-accent uppercase tracking-[0.16em] text-gold">Al Paninos catering order</p>
              </div>
              <div className="px-6 py-8 sm:px-8">
                <h2 className="font-display text-2xl font-extrabold text-ink">The order form is on its way</h2>
                <p className="mt-2 text-stone-600">Al Panino&apos;s is loading the catering menu onto the website. Check back shortly{phone ? ", or call the store and we'll take your order" : ""}.</p>
                {phone && (
                  <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand px-6 py-3.5 text-[14px] font-extrabold uppercase tracking-wide text-white hover:bg-brand-dark">
                    <Phone className="size-4" aria-hidden />
                    Call {phone}
                  </a>
                )}
              </div>
            </div>
          </div>
        </section>
      ) : (
        <>
          {/* ---- The spreads ---------------------------------------------- */}
          <section id="packages" aria-labelledby="packages-title" className="scroll-mt-20 bg-cream">
            <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
              <div className="max-w-2xl">
                <p className="text-[13px] font-extrabold font-accent uppercase tracking-[0.18em] text-brand">The spreads</p>
                <h2 id="packages-title" className="mt-2 font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
                  Pick your package
                </h2>
                <p className="mt-3 text-lg leading-8 text-stone-600">Every price is per person, with salad and dessert included unless it says otherwise. Upgrades and add-ons are right in the order form.</p>
              </div>
              <div className="mt-10">
                <PackageCards packages={packages} stores={stores} initialStoreId={store!.id} customPhone={phone} />
              </div>
            </div>
          </section>

          {/* ---- What's on the menu --------------------------------------- */}
          <section aria-labelledby="menu-title" className="bg-white">
            <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
              <p className="text-[13px] font-extrabold font-accent uppercase tracking-[0.18em] text-brand">What&apos;s on the menu</p>
              <h2 id="menu-title" className="mt-2 font-display text-4xl font-extrabold tracking-tight text-ink">
                The lineup
              </h2>
              <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                {menu.sandwiches.length > 0 && (
                  <div>
                    <h3 className="font-display text-2xl font-extrabold text-ink">Al Panino&apos;s sandwich lineup</h3>
                    <p className="mt-1.5 text-[15px] text-stone-600">For the Classic Luncheon, Al Panino&apos;s picks an assortment of our most popular. Got favourites? Pick them in your order.</p>
                    <ul className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
                      {menu.sandwiches.map((name) => (
                        <li key={name}>
                          <p className="font-bold text-ink">{name}</p>
                          {descriptions[name] && <p className="mt-0.5 text-[14px] leading-5 text-stone-500">{tidyDescription(descriptions[name])}</p>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="space-y-8">
                  {(
                    [
                      ["Salads", menu.salad],
                      ["Desserts", menu.dessert],
                    ] as const
                  ).map(([title, g]) =>
                    g.standard.length || g.upgrades.length ? (
                      <div key={title}>
                        <h3 className="font-display text-2xl font-extrabold text-ink">{title}</h3>
                        <div className="mt-3 grid gap-4 sm:grid-cols-2">
                          <div>
                            <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-stone-500">Standard</p>
                            <p className="text-[13px] font-semibold text-stone-500">Included</p>
                            <ul className="mt-2 space-y-1 text-[15px] font-semibold text-ink">
                              {g.standard.map((n) => (
                                <li key={n}>{n}</li>
                              ))}
                            </ul>
                          </div>
                          {g.upgrades.length > 0 && (
                            <div>
                              <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-brand">Al Panino&apos;s Choice</p>
                              <p className="text-[13px] font-semibold text-stone-500">+{money(Math.min(...g.upgrades.map((o) => Number(o.price_adjustment))))} per person</p>
                              <ul className="mt-2 space-y-1 text-[15px] font-semibold text-ink">
                                {g.upgrades.map((o) => (
                                  <li key={o.id}>{o.name}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null
                  )}
                  {menu.addons.length > 0 && (
                    <div className="rounded-2xl bg-ink p-6 text-white">
                      <h3 className="font-display text-2xl font-extrabold">Add-ons</h3>
                      <ul className="mt-3 divide-y divide-white/10 text-[15px]">
                        {menu.addons.map((o) => (
                          <li key={o.id} className="flex items-baseline justify-between gap-4 py-2">
                            <span className="font-semibold">{o.name.replace(/\s*\(we'll call to arrange\)/i, "")}</span>
                            <span className="shrink-0 font-bold tabular-nums text-gold">{Number(o.price_adjustment) > 0 ? `+${money(Number(o.price_adjustment))} / person` : "Just ask"}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* ---- The order form ------------------------------------------- */}
          <section id="order" aria-labelledby="order-title" className="scroll-mt-20 bg-cream">
            <div className="mx-auto max-w-7xl px-4 pb-24 pt-14 sm:px-6">
              <div className="mx-auto max-w-3xl text-center">
                <p className="text-[13px] font-extrabold font-accent uppercase tracking-[0.18em] text-brand">Order online</p>
                <h2 id="order-title" className="mt-2 font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
                  Place your catering order
                </h2>
                <p className="mt-3 text-lg leading-8 text-stone-600">One form, and it goes straight to the store. Al Panino&apos;s calls you to confirm the details before anything hits the press.</p>
              </div>
              <div className="mt-8">
                <CateringOrder packages={packages} stores={stores} initialStoreId={store!.id} />
              </div>
            </div>
          </section>
        </>
      )}

      {/* ---- Good to know -------------------------------------------------- */}
      <section aria-labelledby="know-title" className="bg-white">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div>
              <h2 id="know-title" className="font-display text-3xl font-extrabold tracking-tight text-ink">
                Good to know
              </h2>
              <ul className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-2">
                {GOOD_TO_KNOW.map(({ Icon, text }) => (
                  <li key={text} className="flex gap-3">
                    <Icon className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
                    <span className="text-[15px] leading-6 text-stone-700">{text}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-6 flex gap-3 rounded-xl bg-amber-50 p-4 text-[14px] leading-6 text-amber-950 ring-1 ring-amber-200">
                <ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
                We can&apos;t guarantee a nut-free or allergen-free kitchen. Tell us about any allergies in your order and we&apos;ll take every care.
              </p>
            </div>
            <div className="grain rounded-2xl bg-ink p-7 text-white">
              <MessageCircleQuestion className="size-7 text-gold" aria-hidden />
              <p className="mt-3 font-display text-2xl font-extrabold">Questions first?</p>
              <p className="mt-2 text-[15px] leading-6 text-stone-300">Talk to the store. We&apos;re happy to help you plan the spread.</p>
              <div className="mt-5 flex flex-col gap-2.5">
                {phone && (
                  <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center justify-center gap-2 rounded-lg bg-gold px-5 py-3.5 text-[14px] font-extrabold uppercase tracking-wide text-ink hover:bg-white">
                    <Phone className="size-4" aria-hidden />
                    Call {phone}
                  </a>
                )}
                <Link href="/support?topic=Catering" className="inline-flex items-center justify-center rounded-lg px-5 py-3.5 text-[14px] font-extrabold uppercase tracking-wide text-white ring-1 ring-white/30 hover:bg-white/10">
                  Ask Online
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
