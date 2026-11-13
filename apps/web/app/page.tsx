import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, MapPin, Phone, UtensilsCrossed } from "lucide-react";
import OrderableCard from "@/components/ordering/orderable-card";
import RedPhoto from "@/components/brand/red-photo";
import ApplyDealButton, { DealList } from "@/components/ordering/apply-deal-button";
import type { PromoRow } from "@/lib/ordering/promo";
import OrderStart from "@/components/order-start";
import StoreStatus from "@/components/store-status";
import { everydayMenu, getMenu, getPopular, getStores, pickStore } from "@/lib/menu";
import { restaurantJsonLd } from "@/lib/seo";
import { dealCategory, dealTerms, dealValue, getDeals, type Deal } from "@/lib/deals";
import { weekSummary } from "@/lib/hours";
import { REWARD_TIERS } from "@/lib/ordering/points";

// Rebuilt at most every 5 minutes, so menu, price and deal changes show up
// on their own. (Open/closed is worked out live in the browser.)
export const revalidate = 300;

export const metadata: Metadata = { alternates: { canonical: "/" } };


export default async function HomePage() {
  const stores = await getStores();
  const store = pickStore(stores);
  const [menu, popular, deals] = store
    ? await Promise.all([getMenu(store.id), getPopular(store.id, 8), getDeals(store.id)])
    : [{ categories: [], items: [] }, { items: [], isReal: false }, [] as Deal[]];

  const sections = everydayMenu(menu);
  const itemsById = new Map(menu.items.map((i) => [i.id, i]));
  const favourites = popular.items.slice(0, 4).map((p) => ({ ...p, description: itemsById.get(p.id)?.description ?? null }));
  const categoryByName = new Map(sections.map((s) => [s.category.name.trim().toLowerCase(), s.category]));
  const menuHref = (categoryName?: string | null) => {
    const category = categoryName ? categoryByName.get(categoryName.trim().toLowerCase()) : null;
    return `/menu${store ? `?store=${store.id}` : ""}${category ? `#${category.id}` : ""}`;
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(restaurantJsonLd(stores)) }} />
      {/* ---- Hero: start an order right here --------------------------- */}
      <section className="relative overflow-hidden bg-ink text-white">
        <div className="grid lg:min-h-[640px] lg:grid-cols-2">
          {/* The shop's sign in the brand red: above the words on phones,
              behind the whole band on big screens. */}
          <div className="relative aspect-[4/3] sm:aspect-[16/9] lg:absolute lg:inset-0 lg:aspect-auto">
            <RedPhoto src="/media/storefront.jpg" alt="The red Al Paninos sign over the shop door" sizes="100vw" priority position="50% 0%" />
            <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink via-ink/15 to-transparent lg:bg-gradient-to-r lg:from-ink lg:from-25% lg:via-ink/60 lg:via-55% lg:to-ink/0" />
            <span className="absolute bottom-5 right-5 hidden rotate-2 rounded-md bg-gold px-3.5 py-2 text-[13px] font-extrabold uppercase tracking-wide text-wine shadow-lg sm:block">
              +10 PaninoPoints per $1
            </span>
          </div>

          <div className="relative flex items-center">
            <div className="w-full px-4 pb-14 pt-2 sm:px-6 lg:ml-auto lg:max-w-[640px] lg:py-20 lg:pr-14">
              <p className="text-[13px] font-extrabold font-accent uppercase tracking-[0.18em] text-gold">Fresh off the press</p>
              <h1 className="mt-4 font-display text-[2.75rem] font-extrabold leading-[1] tracking-tight sm:text-6xl xl:text-[4.25rem]">
                Pressed hot.
                <br />
                Stacked high.
              </h1>
              <p className="mt-5 max-w-md text-lg leading-8 text-stone-300">
                Toasted paninos, wraps and loaded fries, made to order in St. Thomas and London.
              </p>
              <div className="mt-8 max-w-md">
                <OrderStart stores={stores.map((s) => ({ id: s.id, name: s.name, address: s.address }))} />
              </div>
              <Link href="/catering" className="group mt-5 inline-flex items-center gap-1.5 text-[15px] font-semibold text-stone-300 hover:text-white">
                Feeding a crowd? <span className="font-bold text-white underline decoration-gold decoration-2 underline-offset-4">Order catering</span>
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ---- Deals ------------------------------------------------------ */}
      <section id="deals" className="scroll-mt-24 bg-cream py-16 md:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHeading eyebrow="Deals & offers" title="Today's deals" action={{ href: "/deals", label: "All deals" }} />
          {/* Up to three deals this customer hasn't used up yet -- or the
              PaninoPoints tiles when there are none. */}
          <DealList
            as="div"
            className="mt-8 grid gap-5 md:grid-cols-3"
            limit={3}
            items={deals.map((deal, i) => {
              const { key, ...tile } = dealTile(deal, i, menuHref);
              return { key, code: deal.code, singleUse: deal.single_use, node: <PromoTile {...tile} /> };
            })}
            empty={
              <div className="mt-8 grid gap-5 md:grid-cols-3">
                {FALLBACK_TILES.map(({ key, ...tile }) => (
                  <PromoTile key={key} {...tile} />
                ))}
              </div>
            }
          />
        </div>
      </section>

      {/* ---- The menu, by category ------------------------------------- */}
      {sections.length > 0 && (
        <section className="bg-white py-16 md:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <SectionHeading eyebrow="Our menu" title="What are you craving?" action={{ href: menuHref(), label: "View full menu" }} />
            <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-6">
              {sections.map(({ category, items }, index) => {
                const photo = category.image_url ?? items.find((i) => i.image_url)?.image_url;
                return (
                  <Link key={category.id} href={menuHref(category.name)} className="group block">
                    <div className="relative aspect-square overflow-hidden rounded-xl bg-cream-deep">
                      {photo ? (
                        <Image
                          src={photo}
                          alt=""
                          fill
                          sizes="(min-width: 1024px) 200px, (min-width: 640px) 33vw, 50vw"
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div aria-hidden className={`absolute inset-0 ${TILE_COLOURS[index % TILE_COLOURS.length]}`}>
                          <UtensilsCrossed className="absolute left-1/2 top-1/2 size-14 -translate-x-1/2 -translate-y-1/2 text-white/25" strokeWidth={1.5} />
                        </div>
                      )}
                    </div>
                    <p className="mt-3 flex items-center gap-1 font-display text-[17px] font-extrabold text-ink group-hover:text-brand">
                      {category.name}
                      <ArrowRight className="size-4 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden />
                    </p>
                    <p className="text-[13px] text-stone-500">
                      {items.length} {items.length === 1 ? "item" : "items"}
                    </p>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ---- Fan favourites -------------------------------------------- */}
      {favourites.length > 0 && (
        <section className="bg-cream py-16 md:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <SectionHeading
              eyebrow={popular.isReal ? "Popular right now" : "Our signatures"}
              title="The ones everyone orders"
              action={{ href: menuHref(), label: "See the full menu" }}
            />
            <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
              {favourites.map((item, i) => (
                <OrderableCard key={item.id} item={item} badge={i === 0 && popular.isReal ? "#1 this month" : null} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ---- Catering --------------------------------------------------- */}
      <section id="catering" className="grain scroll-mt-24 bg-brand py-16 text-white md:py-24">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_1.15fr] lg:items-center">
          <div>
            <p className="text-[13px] font-extrabold font-accent uppercase tracking-[0.18em] text-gold">Catering</p>
            <h2 className="mt-3 font-display text-4xl font-extrabold leading-[1.02] tracking-tight sm:text-[3.4rem]">
              Feeding the whole crew?
            </h2>
            <p className="mt-5 max-w-lg text-lg leading-8 text-white/85">
              Six spreads priced per person, from sandwich luncheons and build-your-own paninos to tacos, pasta, Texas BBQ and Greek. No minimum.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/catering"
                className="rounded-lg bg-gold px-6 py-3.5 text-[15px] font-extrabold uppercase tracking-wide text-wine transition-transform hover:-translate-y-0.5"
              >
                Start a Catering Order
              </Link>
              <Link
                href="/support?topic=Catering"
                className="rounded-lg border border-white/40 px-6 py-3.5 text-[15px] font-extrabold uppercase tracking-wide text-white transition-colors hover:bg-white/10"
              >
                Ask a Question
              </Link>
            </div>
          </div>
          <ol className="grid gap-px overflow-hidden rounded-xl bg-white/15 sm:grid-cols-3">
            {[
              { title: "Pick your spread", text: "Six packages priced per person, with salad and dessert included." },
              { title: "Order by 6 PM", text: "For pickup or delivery the next day, at the time you choose." },
              { title: "We confirm every detail", text: "A quick call to check everything before we start." },
            ].map((step, i) => (
              <li key={step.title} className="bg-wine/40 p-6">
                <span className="font-display text-5xl font-extrabold text-gold">{i + 1}</span>
                <h3 className="mt-3 text-lg font-bold">{step.title}</h3>
                <p className="mt-1.5 text-[15px] leading-6 text-white/75">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---- PaninoPoints ------------------------------------------------ */}
      <section id="rewards" className="scroll-mt-24 bg-cream-deep py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:items-end">
            <div>
              <p className="text-[13px] font-extrabold font-accent uppercase tracking-[0.18em] text-brand">PaninoPoints</p>
              <h2 className="mt-3 font-display text-4xl font-extrabold leading-[1.02] tracking-tight text-ink sm:text-[3.4rem]">
                Eat. Earn. Repeat.
              </h2>
              <p className="mt-5 max-w-md text-lg leading-8 text-stone-600">
                10 points for every dollar you spend, plus a free welcome spin, a birthday treat, and rewards for
                bringing friends.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/join"
                  className="rounded-lg bg-brand px-6 py-3.5 text-[15px] font-extrabold uppercase tracking-wide text-white transition-colors hover:bg-brand-dark"
                >
                  Join for Free
                </Link>
                <Link
                  href="/rewards"
                  className="rounded-lg border border-ink/25 px-6 py-3.5 text-[15px] font-extrabold uppercase tracking-wide text-ink transition-colors hover:bg-white"
                >
                  How It Works
                </Link>
              </div>
            </div>
            <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {REWARD_TIERS.map((tier) => (
                <li key={tier.cost} className="rounded-xl border-2 border-dashed border-ink/15 bg-white p-5 text-center">
                  <span className="block font-display text-3xl font-extrabold text-brand tabular-nums">
                    {tier.cost.toLocaleString("en-CA")}
                  </span>
                  <span className="block text-xs font-bold uppercase tracking-wide text-stone-500">points</span>
                  <span className="mt-3 block border-t border-stone-200 pt-3 font-bold text-ink">{tier.title}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ---- Locations ---------------------------------------------------- */}
      {stores.length > 0 && (
        <section id="locations" className="scroll-mt-24 bg-white py-16 md:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <SectionHeading eyebrow="Locations" title="Find your Al Panino's" action={{ href: "/locations", label: "Hours & directions" }} />
            <div className="mt-8 grid gap-5 md:grid-cols-2">
              {stores.map((s) => (
                <article key={s.id} className="grid gap-6 rounded-xl p-6 ring-1 ring-stone-200 sm:grid-cols-[1fr_auto] sm:p-7">
                  <div>
                    <h3 className="font-display text-2xl font-extrabold tracking-tight text-ink">{s.name}</h3>
                    {!!s.address && (
                      <p className="mt-1.5 flex items-start gap-1.5 text-[15px] text-stone-600">
                        <MapPin className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                        {s.address}
                      </p>
                    )}
                    {!!s.phone && (
                      <a href={`tel:${s.phone.replace(/[^\d+]/g, "")}`} className="mt-1 flex items-center gap-1.5 text-[15px] text-stone-600 hover:text-brand">
                        <Phone className="size-4 shrink-0 text-brand" aria-hidden />
                        {s.phone}
                      </a>
                    )}
                    <div className="mt-3">
                      <StoreStatus hours={s.hours} />
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2.5">
                      <Link
                        href={`/menu?store=${s.id}`}
                        className="rounded-lg bg-brand px-5 py-3 text-[13px] font-extrabold uppercase tracking-wide text-white transition-colors hover:bg-brand-dark"
                      >
                        Order Here
                      </Link>
                      {!!s.address && (
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Al Paninos ${s.address}`)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg border border-stone-300 px-5 py-3 text-[13px] font-extrabold uppercase tracking-wide text-ink transition-colors hover:bg-cream"
                        >
                          Directions
                        </a>
                      )}
                    </div>
                  </div>
                  <dl className="grid h-fit grid-cols-[auto_auto] gap-x-5 gap-y-1.5 rounded-lg bg-cream p-4 text-[14px]">
                    {weekSummary(s.hours).map((row) => (
                      <div key={row.days} className="contents">
                        <dt className="font-semibold text-ink">{row.days}</dt>
                        <dd className="text-stone-600 tabular-nums">{row.time}</dd>
                      </div>
                    ))}
                  </dl>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}

function SectionHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-5">
      <div>
        <p className="text-[13px] font-extrabold font-accent uppercase tracking-[0.18em] text-brand">{eyebrow}</p>
        <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-ink sm:text-[2.5rem] sm:leading-[1.1]">
          {title}
        </h2>
      </div>
      {action && (
        <Link
          href={action.href}
          className="group inline-flex items-center gap-1.5 text-[14px] font-extrabold uppercase tracking-wide text-brand hover:text-brand-dark"
        >
          {action.label}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      )}
    </div>
  );
}

// ---- Promo tiles --------------------------------------------------------

type Tile = {
  key: string;
  tone: "red" | "ink" | "gold";
  eyebrow: string;
  value: string;
  title: string;
  text: string | null;
  terms: string[];
  href: string;
  cta: string;
  deal?: PromoRow;
};

const TONES: Record<Tile["tone"], { box: string; eyebrow: string; value: string; text: string; button: string }> = {
  red: { box: "bg-brand text-white", eyebrow: "text-gold", value: "text-white", text: "text-white/80", button: "bg-white text-brand hover:bg-cream" },
  ink: { box: "bg-ink text-white", eyebrow: "text-blush", value: "text-gold", text: "text-stone-300", button: "bg-gold text-wine hover:bg-white" },
  gold: { box: "bg-gold text-wine", eyebrow: "text-brand", value: "text-wine", text: "text-wine/80", button: "bg-wine text-white hover:bg-ink" },
};
const TONE_ORDER: Tile["tone"][] = ["red", "ink", "gold"];

function dealTile(deal: Deal, index: number, menuHref: (category?: string | null) => string): Tile {
  const category = dealCategory(deal);
  return {
    key: deal.id,
    tone: TONE_ORDER[index % TONE_ORDER.length],
    eyebrow: category ?? "Deal",
    value: dealValue(deal),
    title: deal.title,
    text: deal.description,
    terms: dealTerms(deal),
    href: menuHref(category),
    cta: "Apply Deal",
    deal: deal as unknown as PromoRow,
  };
}

// When there are no store-wide deals running, the space still sells.
const FALLBACK_TILES: Tile[] = [
  {
    key: "catering",
    tone: "red",
    eyebrow: "Catering",
    value: "No minimum",
    title: "Six spreads, priced per person",
    text: "Order by 6 PM for pickup or delivery the next day.",
    terms: [],
    href: "/catering",
    cta: "Order Catering",
  },
  {
    key: "points",
    tone: "ink",
    eyebrow: "PaninoPoints",
    value: "10 pts / $1",
    title: "Every order earns",
    text: "Free dips, drinks, sides and sandwiches as you go.",
    terms: [],
    href: "/join",
    cta: "Join for Free",
  },
  {
    key: "welcome",
    tone: "gold",
    eyebrow: "New here?",
    value: "Free spin",
    title: "A welcome prize",
    text: "Create an account and get a free spin for a prize in the Al Panino's app.",
    terms: [],
    href: "/join",
    cta: "Get Started",
  },
];

function PromoTile({ tone, eyebrow, value, title, text, terms, href, cta, deal }: Omit<Tile, "key">) {
  const t = TONES[tone];
  return (
    <article className={`relative flex min-h-[250px] flex-col overflow-hidden rounded-xl p-6 sm:p-7 ${t.box}`}>
      <UtensilsCrossed aria-hidden className="absolute -bottom-8 -right-8 size-44 -rotate-12 opacity-[0.07]" strokeWidth={1.25} />
      <p className={`text-[12px] font-extrabold font-accent uppercase tracking-[0.16em] ${t.eyebrow}`}>{eyebrow}</p>
      <p className={`mt-2 font-display text-[2.6rem] font-extrabold leading-none tracking-tight ${t.value}`}>{value}</p>
      <h3 className="mt-3 text-lg font-bold">{title}</h3>
      {!!text && <p className={`mt-1 line-clamp-2 text-[15px] leading-6 ${t.text}`}>{text}</p>}
      {terms.length > 0 && <p className={`mt-2 text-[12.5px] font-semibold ${t.text}`}>{terms.join(" · ")}</p>}
      <div className="flex-1" />
      {deal ? (
        <ApplyDealButton deal={deal} href={href} className={`relative mt-6 self-start rounded-lg px-5 py-3 text-[13px] font-extrabold uppercase tracking-wide transition-colors ${t.button}`}>
          {cta}
        </ApplyDealButton>
      ) : (
        <Link href={href} className={`relative mt-6 self-start rounded-lg px-5 py-3 text-[13px] font-extrabold uppercase tracking-wide transition-colors ${t.button}`}>
          {cta}
        </Link>
      )}
    </article>
  );
}

const TILE_COLOURS = ["bg-brand", "bg-ink", "bg-wine", "bg-[#2b2522]"];
