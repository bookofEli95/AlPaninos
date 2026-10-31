"use client";

import { useState } from "react";
import { Check, MapPin, Pencil } from "lucide-react";
import { cart, useCart } from "@/lib/cart";

// "Delivering to ..." under the menu banner, with the address editable
// right there -- checkout needs it anyway.
export default function DeliveryAddressBar() {
  const { address } = useCart();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const showForm = editing || !address;

  if (!showForm) {
    return (
      <p className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-white/5 px-4 py-3 text-[14px] text-stone-300 ring-1 ring-white/10">
        <MapPin className="size-4 text-gold" aria-hidden />
        <span>
          Delivering to <strong className="text-white">{address}</strong>
        </span>
        <button
          type="button"
          onClick={() => {
            setDraft(address);
            setEditing(true);
          }}
          className="inline-flex items-center gap-1 font-bold text-gold hover:underline"
        >
          <Pencil className="size-3.5" aria-hidden />
          Change
        </button>
      </p>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!draft.trim()) return;
        cart.setAddress(draft.trim());
        setEditing(false);
      }}
      className="mt-6 flex flex-col gap-2 sm:flex-row"
    >
      <label className="relative flex-1">
        <span className="sr-only">Delivery address</span>
        <MapPin className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-stone-400" aria-hidden />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Where should we deliver? Street address, city"
          autoComplete="street-address"
          className="w-full rounded-lg bg-white py-3 pl-10 pr-3.5 text-[15px] text-ink outline-none ring-1 ring-white/20 focus:ring-4 focus:ring-gold/40"
        />
      </label>
      <button type="submit" className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-gold px-5 py-3 text-[14px] font-extrabold uppercase tracking-wide text-ink hover:bg-white">
        <Check className="size-4" aria-hidden />
        Save Address
      </button>
    </form>
  );
}
