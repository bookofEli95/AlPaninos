"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Car, MapPin, Store } from "lucide-react";
import { useCart } from "@/lib/cart";

type StoreOption = { id: string; name: string; address: string | null };

// "Start your order" on the homepage, the way big restaurant websites do
// it: choose Pickup or Delivery first, then the store (or your address),
// then straight to the menu.
export default function OrderStart({ stores }: { stores: StoreOption[] }) {
  const router = useRouter();
  // Whatever's picked here wins; until then it's what the order already has
  // (someone coming back keeps their store, delivery and address).
  const c = useCart();
  const [pickedMode, setMode] = useState<"pickup" | "delivery" | null>(null);
  const [pickedStore, setStoreId] = useState<string | null>(null);
  const [typedAddress, setAddress] = useState<string | null>(null);
  const mode = pickedMode ?? c.mode;
  const storeId = pickedStore ?? (c.storeId && stores.some((s) => s.id === c.storeId) ? c.storeId : stores[0]?.id ?? "");
  const address = typedAddress ?? c.address;

  const start = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams({ store: storeId, mode });
    if (mode === "delivery" && address.trim()) params.set("address", address.trim());
    router.push(`/menu?${params.toString()}`);
  };

  return (
    <form onSubmit={start} className="overflow-hidden rounded-xl bg-white text-ink shadow-2xl shadow-black/30">
      <div className="grid grid-cols-2" role="tablist" aria-label="How do you want it?">
        {(
          [
            { key: "pickup", label: "Pickup", Icon: Store },
            { key: "delivery", label: "Delivery", Icon: Car },
          ] as const
        ).map(({ key, label, Icon }) => {
          const on = mode === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setMode(key)}
              className={`flex items-center justify-center gap-2 border-b-[3px] py-4 text-[15px] font-extrabold uppercase tracking-wide transition-colors ${
                on ? "border-brand bg-white text-brand" : "border-stone-200 bg-stone-50 text-stone-500 hover:text-ink"
              }`}
            >
              <Icon className="size-[18px]" aria-hidden />
              {label}
            </button>
          );
        })}
      </div>

      <div className="space-y-3 p-5">
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wide text-stone-500">
            {mode === "pickup" ? "Pick up from" : "Deliver from"}
          </span>
          <select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3.5 py-3 text-[15px] font-semibold outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.address ? ` · ${s.address.split(",")[0]}` : ""}
              </option>
            ))}
          </select>
        </label>

        {mode === "delivery" && (
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-stone-500">Delivery address</span>
            <span className="relative mt-1.5 block">
              <MapPin className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-stone-400" aria-hidden />
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Street address, city"
                autoComplete="street-address"
                className="w-full rounded-lg border border-stone-300 py-3 pl-10 pr-3.5 text-[15px] outline-none focus:border-brand focus:ring-4 focus:ring-brand/10"
              />
            </span>
          </label>
        )}

        <button
          type="submit"
          className="group flex w-full items-center justify-center gap-2 rounded-lg bg-brand py-3.5 text-[15px] font-extrabold uppercase tracking-wide text-white transition-colors hover:bg-brand-dark"
        >
          Start {mode === "pickup" ? "Pickup" : "Delivery"} Order
          <ArrowRight className="size-[18px] transition-transform group-hover:translate-x-0.5" aria-hidden />
        </button>
      </div>
    </form>
  );
}
