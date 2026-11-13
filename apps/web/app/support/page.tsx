import type { Metadata } from "next";
import Link from "next/link";
import { Clock, MapPin, Phone } from "lucide-react";
import PageBanner from "@/components/page-banner";
import SupportForm from "@/components/support/support-form";
import StoreStatus from "@/components/store-status";
import { getStores } from "@/lib/menu";

export const metadata: Metadata = {
  alternates: { canonical: "/support" },
  title: "Help & Customer Support",
  description: "Questions about an order, catering or your account? Contact Al Panino's in St. Thomas and London, Ontario.",
};

const QUICK = [
  { q: "Where's my order?", a: "Open it from your account, or from the browser you ordered on, to follow it live.", href: "/account", cta: "My orders" },
  { q: "Need to change or cancel?", a: "Call the store straight away. Once it's in the press, changes may not be possible.", href: "/locations", cta: "Store numbers" },
  { q: "Allergies?", a: "Add them to the kitchen notes when you order, and ask the team about ingredients.", href: "/menu", cta: "Menu" },
];

export default async function SupportPage({ searchParams }: PageProps<"/support">) {
  const { order, topic } = await searchParams;
  const stores = await getStores();
  return (
    <>
      <PageBanner crumb="Help" eyebrow="Customer support" title="How can we help?" intro="Send the team a message below, or call your store for anything about an order happening right now." />
      <div className="bg-cream">
        <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <SupportForm orderId={typeof order === "string" ? order : null} topic={typeof topic === "string" ? topic : null} />
          <aside className="space-y-4">
            {stores.map((s) => (
              <div key={s.id} className="rounded-2xl bg-white p-6 ring-1 ring-stone-200">
                <p className="font-display text-xl font-extrabold text-ink">{s.name}</p>
                <div className="mt-1.5">
                  <StoreStatus hours={s.hours} />
                </div>
                {s.address && (
                  <p className="mt-2 flex items-start gap-1.5 text-[14px] text-stone-600">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                    {s.address}
                  </p>
                )}
                {s.phone ? (
                  <a href={`tel:${s.phone.replace(/[^\d+]/g, "")}`} className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-ink py-3 text-[14px] font-bold text-white hover:bg-black">
                    <Phone className="size-4" aria-hidden />
                    Call {s.phone}
                  </a>
                ) : (
                  <Link href="/locations" className="mt-4 flex items-center justify-center gap-2 rounded-lg py-3 text-[14px] font-bold text-ink ring-1 ring-stone-300">
                    <Clock className="size-4" aria-hidden />
                    Hours & directions
                  </Link>
                )}
              </div>
            ))}
            <div className="divide-y divide-stone-200 rounded-2xl bg-white ring-1 ring-stone-200">
              {QUICK.map(({ q, a, href, cta }) => (
                <div key={q} className="p-5">
                  <p className="font-bold text-ink">{q}</p>
                  <p className="mt-1 text-[14px] leading-6 text-stone-600">{a}</p>
                  <Link href={href} className="mt-2 inline-block text-[13px] font-extrabold uppercase tracking-wide text-brand hover:underline">
                    {cta}
                  </Link>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
