"use client";

import { useState } from "react";
import { Check, MapPin, Pencil } from "lucide-react";
import { cart, useCart } from "@/lib/cart";
import { addressLookupOn } from "@/lib/places";
import AddressInput from "./address-input";

// "Delivering to ..." under the menu banner, with the address editable
// right there -- checkout needs it anyway.
export default function DeliveryAddressBar() {
  const { address, addressChecked } = useCart();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ address: "", checked: false });
  const [error, setError] = useState<string | null>(null);
  const showForm = editing || !address;

  const save = (picked: string, checked: boolean) => {
    cart.setAddress(picked, checked);
    setEditing(false);
    setError(null);
  };

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
            setDraft({ address, checked: !!addressChecked });
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
      onSubmit={async (e) => {
        e.preventDefault();
        const typed = draft.address.trim();
        if (!typed) return;
        // A typed address has to be one Google knows (picked from the list).
        if (!draft.checked && (await addressLookupOn())) {
          setError("Choose your address from the list as you type.");
          document.getElementById("menu-address")?.focus();
          return;
        }
        save(typed, draft.checked);
      }}
      className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-start"
    >
      <div className="flex-1">
        <label htmlFor="menu-address" className="sr-only">
          Delivery address
        </label>
        <AddressInput
          id="menu-address"
          icon
          dark
          value={draft.address}
          checked={draft.checked}
          onType={(text) => {
            setDraft({ address: text, checked: false });
            setError(null);
          }}
          // Picking one saves it, as in the app.
          onPick={(picked) => save(picked, true)}
          error={error}
          placeholder="Where should we deliver? Street address, city"
          className="w-full rounded-lg bg-white py-3 pr-3.5 text-[15px] text-ink outline-none ring-1 ring-white/20 focus:ring-4 focus:ring-gold/40"
        />
      </div>
      <button type="submit" className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-gold px-5 py-3 text-[14px] font-extrabold uppercase tracking-wide text-ink hover:bg-white">
        <Check className="size-4" aria-hidden />
        Save Address
      </button>
    </form>
  );
}
