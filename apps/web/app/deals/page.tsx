import type { Metadata } from "next";
import Link from "next/link";
import { Cake, Gift, Sparkles, Tag, Users } from "lucide-react";
import PageBanner from "@/components/page-banner";
import ApplyDealButton from "@/components/ordering/apply-deal-button";
import StoreSelect from "@/components/store-select";
import { getDeals, dealTerms, dealValue } from "@/lib/deals";
import { getStores, pickStore } from "@/lib/menu";
import type { PromoRow } from "@/lib/ordering/promo";

export const metadata: Metadata = {
  alternates: { canonical: "/deals" },
  title: "Deals & Offers",
  description: "Today's Al Panino's deals: save on paninos, wraps and pickup orders in St. Thomas and London, Ontario. Apply a deal and it comes off at checkout.",
};

const PERKS = [
  { Icon: Sparkles, title: "10 points per $1", text: "Every order earns PaninoPoints toward free food.", href: "/rewards", cta: "How it works" },
  { Icon: Gift, title: "Welcome spin", text: "New members spin for a free prize in the Al Panino's app.", href: "/join", cta: "Join free" },
  { Icon: Cake, title: "Birthday treat", text: "Tell us your birthday in the app and we'll treat you.", href: "/rewards", cta: "Learn more" },
  { Icon: Users, title: "Give $5, get $5", text: "Share your code. Friends save $5, and so do you.", href: "/account", cta: "Get your code" },
];

// Every deal running at a store, as coupons: what it takes off, the rules,
// the code, and Apply Deal.
export default async function DealsPage({ searchParams }: PageProps<"/deals">) {
  const { store: storeParam } = await searchParams;
  const stores = await getStores();
  const store = pickStore(stores, typeof storeParam === "string" ? storeParam : null);
  const deals = await getDeals(store?.id ?? null);
  return (
    <>
      <PageBanner crumb="Deals" eyebrow="Deals & offers" title="Today's deals" intro="Apply a deal and it comes off your order at checkout once your order qualifies.">
        {store && stores.length > 1 && (
          <div className="lg:w-72">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-400">Deals at</p>
            <div className="mt-1.5">
              <StoreSelect stores={stores.map((s) => ({ id: s.id, name: s.name }))} current={store.id} mode="pickup" path="/deals" />
            </div>
          </div>
        )}
      </PageBanner>
      <div className="bg-cream">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
          {deals.length === 0 ? (
            <p className="rounded-2xl bg-white p-10 text-center text-stone-500 ring-1 ring-stone-200">No deals are running right now. Join PaninoPoints and every order still earns toward free food.</p>
          ) : (
            <ul className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {deals.map((deal) => {
                const menuHref = `/menu?store=${store?.id ?? ""}`;
                return (
                  <li key={deal.id} className="relative flex overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
                    <div className="flex w-32 shrink-0 flex-col items-center justify-center bg-brand p-4 text-center text-white sm:w-36">
                      <Tag className="size-5 text-gold" aria-hidden />
                      <p className="mt-2 font-display text-3xl font-extrabold leading-none">{dealValue(deal)}</p>
                    </div>
                    <div className="flex flex-1 flex-col border-l-2 border-dashed border-stone-200 p-5">
                      <h2 className="font-display text-xl font-extrabold leading-snug text-ink">{deal.title}</h2>
                      {deal.description && <p className="mt-1.5 text-[14px] leading-6 text-stone-600">{deal.description}</p>}
                      {dealTerms(deal).length > 0 && <p className="mt-2 text-[13px] font-semibold text-stone-500">{dealTerms(deal).join(" · ")}</p>}
                      <div className="mt-auto flex flex-wrap items-center gap-3 pt-5">
                        <ApplyDealButton
                          deal={deal as unknown as PromoRow}
                          href={menuHref}
                          className="rounded-lg bg-brand px-4 py-2.5 text-[13px] font-extrabold uppercase tracking-wide text-white hover:bg-brand-dark"
                        >
                          Apply Deal
                        </ApplyDealButton>
                        {deal.code && (
                          <span className="text-[13px] text-stone-500">
                            Code <span className="rounded bg-cream-deep px-1.5 py-0.5 font-mono font-bold text-ink">{deal.code}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <h2 className="mt-16 font-display text-3xl font-extrabold tracking-tight text-ink">Member perks</h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PERKS.map(({ Icon, title, text, href, cta }) => (
              <li key={title} className="flex flex-col rounded-2xl bg-white p-6 ring-1 ring-stone-200">
                <Icon className="size-7 text-brand" aria-hidden />
                <h3 className="mt-4 text-lg font-bold text-ink">{title}</h3>
                <p className="mt-1 flex-1 text-[14px] leading-6 text-stone-600">{text}</p>
                <Link href={href} className="mt-4 text-[13px] font-extrabold uppercase tracking-wide text-brand hover:underline">
                  {cta}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
