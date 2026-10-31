import type { Metadata } from "next";
import Link from "next/link";
import { Clock, MapPin, Navigation, Phone } from "lucide-react";
import PageBanner from "@/components/page-banner";
import StoreStatus from "@/components/store-status";
import { getStores } from "@/lib/menu";
import { weekSummary } from "@/lib/hours";
import { restaurantJsonLd } from "@/lib/seo";

export const revalidate = 300;

export const metadata: Metadata = {
  alternates: { canonical: "/locations" },
  title: "Locations & Hours",
  description: "Al Paninos in St. Thomas and London, Ontario: addresses, phone numbers, opening hours and directions. Order ahead for pickup or delivery.",
};

// Every store: where it is, when it's open (live), how to call, directions,
// a map, and Order Here.
export default async function LocationsPage() {
  const stores = await getStores();
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(restaurantJsonLd(stores)) }} />
      <PageBanner crumb="Locations" eyebrow="Find us" title="Locations & Hours" intro="Pressed fresh in St. Thomas and London, Ontario. Order ahead for pickup or delivery, or drop in." />
      <div className="bg-cream">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-12 sm:px-6 lg:grid-cols-2">
          {stores.map((s) => {
            const query = encodeURIComponent(`Al Paninos ${s.address ?? s.name}`);
            const mapSrc =
              s.latitude != null && s.longitude != null
                ? `https://maps.google.com/maps?q=${s.latitude},${s.longitude}&z=15&output=embed`
                : `https://maps.google.com/maps?q=${query}&z=15&output=embed`;
            return (
              <article key={s.id} id={s.id} className="scroll-mt-28 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
                <iframe title={`Map of Al Paninos ${s.name}`} src={mapSrc} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="aspect-[16/9] w-full border-0 bg-cream-deep" />
                <div className="grid gap-6 p-6 sm:grid-cols-[1fr_auto] sm:p-8">
                  <div>
                    <h2 className="font-display text-3xl font-extrabold tracking-tight text-ink">{s.name}</h2>
                    <div className="mt-2">
                      <StoreStatus hours={s.hours} />
                    </div>
                    {s.address && (
                      <p className="mt-3 flex items-start gap-2 text-[15px] text-stone-600">
                        <MapPin className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                        {s.address}
                      </p>
                    )}
                    {s.phone && (
                      <a href={`tel:${s.phone.replace(/[^\d+]/g, "")}`} className="mt-1.5 flex items-center gap-2 text-[15px] text-stone-600 hover:text-brand">
                        <Phone className="size-4 shrink-0 text-brand" aria-hidden />
                        {s.phone}
                      </a>
                    )}
                    <div className="mt-6 flex flex-wrap gap-2.5">
                      <Link href={`/menu?store=${s.id}&mode=pickup`} className="rounded-lg bg-brand px-5 py-3 text-[13px] font-extrabold uppercase tracking-wide text-white hover:bg-brand-dark">
                        Order Pickup
                      </Link>
                      <Link href={`/menu?store=${s.id}&mode=delivery`} className="rounded-lg bg-ink px-5 py-3 text-[13px] font-extrabold uppercase tracking-wide text-white hover:bg-black">
                        Order Delivery
                      </Link>
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${query}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg px-5 py-3 text-[13px] font-extrabold uppercase tracking-wide text-ink ring-1 ring-stone-300 hover:bg-cream"
                      >
                        <Navigation className="size-4" aria-hidden />
                        Directions
                      </a>
                    </div>
                  </div>
                  <div>
                    <p className="flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-[0.12em] text-stone-500">
                      <Clock className="size-3.5" aria-hidden />
                      Hours
                    </p>
                    <dl className="mt-2 grid grid-cols-[auto_auto] gap-x-5 gap-y-1.5 rounded-lg bg-cream p-4 text-[14px]">
                      {weekSummary(s.hours).map((row) => (
                        <div key={row.days} className="contents">
                          <dt className="font-semibold text-ink">{row.days}</dt>
                          <dd className="tabular-nums text-stone-600">{row.time}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </>
  );
}
