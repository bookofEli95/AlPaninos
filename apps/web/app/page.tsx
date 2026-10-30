import Link from "next/link";
import { ArrowRight, CalendarClock, Clock, Flame, Gift, MapPin, Phone, PartyPopper, ShoppingBag, Sparkles, Users, UtensilsCrossed } from "lucide-react";
import ItemCard from "@/components/item-card";
import Image from "next/image";
import StoreStatus from "@/components/store-status";
import { everydayMenu, getMenu, getPopular, getStores, pickStore } from "@/lib/menu";
import { weekSummary } from "@/lib/hours";

// Rebuilt at most every 5 minutes, so menu and price changes show up on
// their own. (Open/closed is worked out live in the browser.)
export const revalidate = 300;

const REWARD_TIERS = [
  { points: 150, reward: "Free dip" },
  { points: 300, reward: "Free drink" },
  { points: 600, reward: "Free specialty side" },
  { points: 1200, reward: "Free sandwich" },
];

export default async function HomePage() {
  const stores = await getStores();
  const store = pickStore(stores);
  const [menu, popular] = store
    ? await Promise.all([getMenu(store.id), getPopular(store.id, 8)])
    : [{ categories: [], items: [] }, { items: [], isReal: false }];

  const sections = everydayMenu(menu);
  const itemsById = new Map(menu.items.map((i) => [i.id, i]));
  const favourites = popular.items.slice(0, 4).map((p) => ({ ...p, description: itemsById.get(p.id)?.description ?? null }));

  return (
    <>
      {/* ---- Hero ------------------------------------------------------ */}
      <section className="grain relative overflow-hidden bg-ink text-cream-deep">
        <div aria-hidden className="pointer-events-none absolute -left-48 top-1/4 size-[38rem] rounded-full bg-brand/45 blur-[130px]" />
        <div aria-hidden className="pointer-events-none absolute -right-32 -top-40 size-[30rem] rounded-full bg-gold/10 blur-[110px]" />

        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-16 pt-12 sm:px-6 md:pb-20 md:pt-16 lg:grid-cols-[1.08fr_0.92fr] lg:gap-10 lg:py-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3.5 py-1.5 text-[13px] font-semibold text-cream-deep/90">
              <Flame className="size-4 text-gold" aria-hidden />
              Fresh off the press in St. Thomas &amp; London
            </p>
            <h1 className="mt-6 font-display text-[2.85rem] font-extrabold leading-[1.02] tracking-tight sm:text-6xl lg:text-[4.35rem]">
              Pressed hot.
              <br />
              <span className="text-gold">Stacked high.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-stone-300">
              Toasted paninos, wraps and loaded fries, made to order. Grab it for pickup, have it delivered, or feed the
              whole crew with catering.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/menu"
                className="group inline-flex items-center gap-2 rounded-full bg-brand px-7 py-4 text-base font-bold text-cream-deep shadow-lg shadow-brand/30 transition-colors hover:bg-brand-dark"
              >
                Start Your Order
                <ArrowRight className="size-5 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
              <Link
                href="/#catering"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 px-7 py-4 text-base font-bold text-cream-deep transition-colors hover:bg-white/10"
              >
                Plan Catering
              </Link>
            </div>
            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-white/10 pt-6">
              {[
                { value: "~20 min", label: "for pickup" },
                { value: "10 pts", label: "for every $1" },
                { value: String(stores.length || 2), label: stores.length === 1 ? "Ontario store" : "Ontario stores" },
              ].map((stat) => (
                <div key={stat.label}>
                  <dt className="sr-only">{stat.label}</dt>
                  <dd className="font-display text-2xl font-extrabold tracking-tight text-cream-deep sm:text-[1.7rem]">{stat.value}</dd>
                  <dd className="text-[13px] text-stone-400">{stat.label}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative mx-auto w-full max-w-[24rem] lg:max-w-[26rem]">
            <div className="relative aspect-[4/5] overflow-hidden rounded-[2.25rem] shadow-2xl shadow-black/60 ring-1 ring-white/10">
              <video
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                poster="/media/hero-poster.jpg"
                className="size-full object-cover"
                aria-label="A crispy chicken panino with fries, fresh off the press"
              >
                <source src="/media/hero.mp4" type="video/mp4" />
              </video>
              <div aria-hidden className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/50 to-transparent" />
            </div>
            <div className="absolute -left-3 bottom-8 flex items-center gap-3 rounded-2xl bg-white py-3 pl-3 pr-5 text-ink shadow-2xl shadow-black/30 sm:-left-10">
              <span className="flex size-10 items-center justify-center rounded-full bg-brand/10">
                <Clock className="size-5 text-brand" aria-hidden />
              </span>
              <span>
                <span className="block text-[13.5px] font-bold">Ready in about 20 min</span>
                <span className="block text-xs text-stone-500">Order ahead, skip the line</span>
              </span>
            </div>
            <div className="absolute -right-2 top-7 rotate-3 rounded-full bg-gold px-4 py-2 text-[13px] font-extrabold text-wine shadow-xl shadow-black/30 sm:-right-8">
              +10 PaninoPoints per $1
            </div>
          </div>
        </div>
      </section>

      {/* ---- Fan favourites -------------------------------------------- */}
      {favourites.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-16 sm:px-6 md:pt-24">
          <SectionHeading
            eyebrow={popular.isReal ? "Popular right now" : "Our signatures"}
            title="The ones everyone orders"
            action={{ href: "/menu", label: "See the full menu" }}
          />
          <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {favourites.map((item, i) => (
              <ItemCard key={item.id} item={item} badge={i === 0 && popular.isReal ? "#1 this month" : null} />
            ))}
          </div>
        </section>
      )}

      {/* ---- The menu, by category ------------------------------------- */}
      {sections.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-16 sm:px-6 md:pt-24">
          <SectionHeading eyebrow="The menu" title="Something for everyone" />
          <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3">
            {sections.map(({ category, items }, index) => (
              <Link
                key={category.id}
                href={`/menu${store ? `?store=${store.id}` : ""}#${category.id}`}
                className="group relative isolate flex aspect-[5/4] flex-col justify-end overflow-hidden rounded-[1.6rem] bg-ink p-4 sm:aspect-[4/3] sm:p-6"
              >
                <CategoryBackdrop
                  src={category.image_url ?? items.find((i) => i.image_url)?.image_url}
                  index={index}
                />
                <span className="font-display text-xl font-extrabold leading-tight tracking-tight text-white sm:text-2xl">
                  {category.name}
                </span>
                <span className="mt-1 flex items-center gap-1 text-[13px] font-semibold text-white/75">
                  {items.length} {items.length === 1 ? "item" : "items"}
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" aria-hidden />
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ---- Catering --------------------------------------------------- */}
      <section id="catering" className="mx-auto max-w-6xl scroll-mt-24 px-4 pt-16 sm:px-6 md:pt-24">
        <div className="grain relative overflow-hidden rounded-[2.25rem] bg-brand px-6 py-12 text-cream-deep sm:px-12 md:py-16">
          <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-gold/20 blur-[90px]" />
          <div className="relative grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-gold">Catering</p>
              <h2 className="mt-3 font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
                Feeding the whole crew?
              </h2>
              <p className="mt-5 max-w-lg text-lg leading-8 text-cream-deep/85">
                Panino boards, wrap platters and party packs for the office, birthdays and game day. Tell us how many
                people are coming and we&apos;ll suggest the spread.
              </p>
              <Link
                href="/catering"
                className="group mt-8 inline-flex items-center gap-2 rounded-full bg-gold px-7 py-4 text-base font-extrabold text-wine shadow-lg shadow-black/20 transition-transform hover:-translate-y-0.5"
              >
                Start a Catering Order
                <ArrowRight className="size-5 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </div>
            <ul className="grid gap-3">
              {[
                { icon: Users, title: "Tell us the headcount", text: "We work out how much food you need." },
                { icon: CalendarClock, title: "Order by 6 PM", text: "For pickup or delivery the next day." },
                { icon: Phone, title: "We confirm every detail", text: "A quick call before we start preparing." },
              ].map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex items-start gap-4 rounded-2xl bg-white/[0.09] p-4 ring-1 ring-white/10 backdrop-blur-sm">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-cream-deep text-brand">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span>
                    <span className="block font-bold">{title}</span>
                    <span className="block text-[15px] text-cream-deep/75">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ---- PaninoPoints ------------------------------------------------ */}
      <section id="rewards" className="mx-auto max-w-6xl scroll-mt-24 px-4 pt-16 sm:px-6 md:pt-24">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-brand">PaninoPoints</p>
            <h2 className="mt-3 font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-ink sm:text-5xl">
              Every order earns you something.
            </h2>
            <p className="mt-5 max-w-lg text-lg leading-8 text-stone-600">
              Earn 10 PaninoPoints for every dollar you spend, then trade them for free dips, drinks, sides and
              sandwiches.
            </p>
            <ul className="mt-7 flex flex-wrap gap-2.5">
              {[
                { icon: Sparkles, label: "A free welcome spin" },
                { icon: PartyPopper, label: "A birthday treat" },
                { icon: Gift, label: "Rewards for referring friends" },
              ].map(({ icon: Icon, label }) => (
                <li
                  key={label}
                  className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-ink"
                >
                  <Icon className="size-4 text-brand" aria-hidden />
                  {label}
                </li>
              ))}
            </ul>
            <Link
              href="/menu"
              className="group mt-8 inline-flex items-center gap-2 rounded-full bg-ink px-7 py-4 text-base font-bold text-cream-deep transition-colors hover:bg-black"
            >
              Start Earning
              <ArrowRight className="size-5 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </div>

          <div className="relative rounded-[2rem] bg-ink p-6 text-cream-deep shadow-2xl shadow-black/20 sm:p-8">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-stone-400">Your rewards</span>
              <span className="rounded-full bg-gold px-3 py-1 text-xs font-extrabold text-wine">10 pts per $1</span>
            </div>
            <ol className="mt-6 space-y-3.5">
              {REWARD_TIERS.map((tier, i) => (
                <li key={tier.points} className="flex items-center gap-4">
                  <span className="w-16 shrink-0 text-right font-display text-lg font-extrabold text-gold tabular-nums">
                    {tier.points.toLocaleString("en-CA")}
                  </span>
                  <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-white/10">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-brand to-gold"
                      style={{ width: `${((i + 1) / REWARD_TIERS.length) * 100}%` }}
                    />
                  </span>
                  <span className="w-40 shrink-0 text-[15px] font-semibold">{tier.reward}</span>
                </li>
              ))}
            </ol>
            <p className="mt-6 border-t border-white/10 pt-5 text-sm leading-6 text-stone-400">
              A $30 order earns 300 points, enough for a free drink next time.
            </p>
          </div>
        </div>
      </section>

      {/* ---- Locations ---------------------------------------------------- */}
      {stores.length > 0 && (
        <section id="locations" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6 md:py-24">
          <SectionHeading eyebrow="Locations" title="Come see us" />
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {stores.map((s) => (
              <article key={s.id} className="flex flex-col rounded-[1.6rem] border border-stone-200 bg-white p-6 sm:p-7">
                <h3 className="font-display text-2xl font-extrabold tracking-tight text-ink">{s.name}</h3>
                {!!s.address && (
                  <p className="mt-1.5 flex items-start gap-1.5 text-[15px] text-stone-600">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                    {s.address}
                  </p>
                )}
                <div className="mt-2">
                  <StoreStatus hours={s.hours} />
                </div>
                <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 rounded-2xl bg-cream p-4 text-[14px]">
                  {weekSummary(s.hours).map((row) => (
                    <div key={row.days} className="contents">
                      <dt className="font-semibold text-ink">{row.days}</dt>
                      <dd className="text-stone-600 tabular-nums">{row.time}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-5 grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap">
                  <Link
                    href={`/menu?store=${s.id}`}
                    className="inline-flex items-center justify-center gap-1.5 rounded-full bg-brand px-5 py-3 text-sm font-bold text-cream-deep transition-colors hover:bg-brand-dark"
                  >
                    <ShoppingBag className="size-4" aria-hidden />
                    Order from here
                  </Link>
                  {!!s.address && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Al Paninos ${s.address}`)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 rounded-full border border-stone-300 px-5 py-3 text-sm font-bold text-ink transition-colors hover:bg-cream"
                    >
                      <MapPin className="size-4" aria-hidden />
                      Directions
                    </a>
                  )}
                  {!!s.phone && (
                    <a
                      href={`tel:${s.phone.replace(/[^\d+]/g, "")}`}
                      className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-full border border-stone-300 px-5 py-3 text-sm font-bold text-ink transition-colors hover:bg-cream"
                    >
                      <Phone className="size-4" aria-hidden />
                      {s.phone}
                    </a>
                  )}
                </div>
              </article>
            ))}
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
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-brand">{eyebrow}</p>
        <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-ink sm:text-[2.6rem] sm:leading-[1.1]">
          {title}
        </h2>
      </div>
      {action && (
        <Link
          href={action.href}
          className="group inline-flex items-center gap-1.5 text-[15px] font-bold text-brand hover:text-brand-dark"
        >
          {action.label}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      )}
    </div>
  );
}

// A category tile's background: its photo under a dark fade -- or, with no
// photo yet, a solid brand colour with a faint utensils mark (never a grey
// placeholder under the fade).
const TILE_COLOURS = ["bg-brand", "bg-ink", "bg-wine", "bg-[#2b2522]"];
function CategoryBackdrop({ src, index }: { src: string | null | undefined; index: number }) {
  if (!src) {
    return (
      <div aria-hidden className={`absolute inset-0 -z-10 ${TILE_COLOURS[index % TILE_COLOURS.length]}`}>
        <UtensilsCrossed className="absolute -right-6 -top-6 size-40 rotate-12 text-white/[0.07]" strokeWidth={1.25} />
      </div>
    );
  }
  return (
    <>
      <Image
        src={src}
        alt=""
        fill
        sizes="(min-width: 768px) 33vw, 50vw"
        className="-z-10 object-cover transition-transform duration-700 group-hover:scale-105"
      />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
    </>
  );
}
