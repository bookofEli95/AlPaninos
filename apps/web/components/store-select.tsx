"use client";

import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";

// The store a menu is for, as a drop-down that reloads the menu for the
// one picked (keeping pickup/delivery).
export default function StoreSelect({
  stores,
  current,
  mode,
  path = "/menu",
}: {
  stores: { id: string; name: string }[];
  current: string;
  mode: "pickup" | "delivery";
  path?: string;
}) {
  const router = useRouter();
  return (
    <label className="relative block">
      <span className="sr-only">Store</span>
      <select
        value={current}
        onChange={(e) => router.push(`${path}?${new URLSearchParams({ store: e.target.value, mode }).toString()}`)}
        className="w-full appearance-none rounded-lg bg-white/10 py-3 pl-4 pr-10 text-[14px] font-bold text-white ring-1 ring-white/20 outline-none transition hover:bg-white/15 focus:ring-2 focus:ring-gold [&>option]:text-ink"
      >
        {stores.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-stone-300" aria-hidden />
    </label>
  );
}
