import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, ClipboardCheck, Phone, Receipt, Truck, Users } from "lucide-react";
import PageBanner from "@/components/page-banner";
import OrderableCard from "@/components/ordering/orderable-card";
import StoreSelect from "@/components/store-select";
import { getMenu, getStores, pickStore } from "@/lib/menu";
import { CATERING_MAX_DELIVERY_KM, CATERING_MIN_SUBTOTAL, servesLabel } from "@/lib/ordering/catering";

export const revalidate = 300;

export const metadata: Metadata = {
  alternates: { canonical: "/catering" },
  title: "Catering",
  description: `Al Paninos catering in St. Thomas and London, Ontario: panino boards, salad bowls, fries trays, sweets and drinks for the office, parties and game day. Order by 6 PM for next-day pickup or delivery. $${CATERING_MIN_SUBTOTAL} minimum.`,
};

const PROMISES = [
  { Icon: CalendarClock, title: "Order by 6 PM", text: "For pickup or delivery the next day, at the time you choose. Up to two weeks ahead." },
  { Icon: Truck, title: "Delivered", text: `Within ${CATERING_MAX_DELIVERY_KM} km of the store, to the door, the desk or the front reception.` },
  { Icon: Receipt, title: "Invoices & POs", text: "Add your company, a PO number and where the invoice should go." },
  { Icon: ClipboardCheck, title: "We confirm it", text: "A quick call to check every detail before we start pressing." },
];

// Catering: every package at a store, each opening its builder (choose the
// paninos on a board, the cans in a pack...). Checkout then asks for the
// day and time, and the catering details.
export default async function CateringPage({ searchParams }: PageProps<"/catering">) {
  const { store: storeParam } = await searchParams;
  const stores = await getStores();
  const store = pickStore(stores, typeof storeParam === "string" ? storeParam : null);
  const menu = store ? await getMenu(store.id) : { categories: [], items: [] };
  const sections = menu.categories
    .filter((c) => c.is_catering)
    .map((category) => ({ category, items: menu.items.filter((i) => i.category_id === category.id).sort((a, b) => a.base_price - b.base_price) }))
    .filter((s) => s.items.length > 0);

  return (
    <>
      <PageBanner
        crumb="Catering"
        eyebrow="Catering"
        title="Feed the whole crew"
        intro={`Panino boards, salads, fries trays, sweets and drinks for the office, birthdays and game day. Order by 6 PM for next-day pickup or delivery. $${CATERING_MIN_SUBTOTAL} minimum.`}
      >
        {store && stores.length > 1 && (
          <div className="lg:w-72">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-400">Catering from</p>
            <div className="mt-1.5">
              <StoreSelect stores={stores.map((s) => ({ id: s.id, name: s.name }))} current={store.id} mode="pickup" path="/catering" />
            </div>
          </div>
        )}
      </PageBanner>

      <div className="border-b border-stone-200 bg-white">
        <ul className="mx-auto grid max-w-7xl gap-px bg-stone-200 sm:grid-cols-2 lg:grid-cols-4">
          {PROMISES.map(({ Icon, title, text }) => (
            <li key={title} className="flex gap-4 bg-white px-6 py-6">
              <Icon className="mt-0.5 size-6 shrink-0 text-brand" aria-hidden />
              <span>
                <span className="block font-bold text-ink">{title}</span>
                <span className="mt-0.5 block text-[14px] leading-6 text-stone-600">{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-cream">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
          {sections.length === 0 ? (
            <p className="rounded-2xl bg-white p-10 text-center text-stone-500 ring-1 ring-stone-200">
              Catering isn&apos;t on the menu at this store yet.{" "}
              <Link href="/support?topic=Catering" className="font-bold text-brand underline">
                Ask us about it
              </Link>
              .
            </p>
          ) : (
            sections.map(({ category, items }) => (
              <section key={category.id} aria-labelledby={`cat-${category.id}`} className="mb-14 last:mb-0">
                <h2 id={`cat-${category.id}`} className="border-b border-stone-200 pb-3 font-display text-3xl font-extrabold tracking-tight text-ink">
                  {category.name}
                </h2>
                <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
                  {items.map((item) => (
                    <OrderableCard key={item.id} item={item} badge={item.serves_min ? servesLabel(item.serves_min, item.serves_max) : null} sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw" />
                  ))}
                </div>
              </section>
            ))
          )}

          <div className="mt-14 grid gap-5 rounded-2xl bg-ink p-8 text-white md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="flex items-center gap-2 text-[13px] font-extrabold uppercase tracking-[0.14em] text-gold">
                <Users className="size-4" aria-hidden />
                Big event? Something special?
              </p>
              <p className="mt-2 font-display text-2xl font-extrabold">Tell us what you&apos;re planning and we&apos;ll put the spread together.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/support?topic=Catering" className="rounded-lg bg-gold px-6 py-3.5 text-[14px] font-extrabold uppercase tracking-wide text-ink hover:bg-white">
                Ask a Question
              </Link>
              {store?.phone && (
                <a href={`tel:${store.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-2 rounded-lg px-6 py-3.5 text-[14px] font-extrabold uppercase tracking-wide text-white ring-1 ring-white/30 hover:bg-white/10">
                  <Phone className="size-4" aria-hidden />
                  Call {store.phone}
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
