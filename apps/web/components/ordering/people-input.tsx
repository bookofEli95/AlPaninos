"use client";

import { useState } from "react";
import { maxQuantity } from "@/lib/cart";

// "People" for a per-person package: typed (up to 1,000), or - / +. Beside
// its label (the item builder's footer), or under it like a form field
// (`stacked`, the catering form).
export default function PeopleInput({
  value,
  onChange,
  id,
  label = "People",
  stacked = false,
}: {
  value: number;
  onChange: (n: number) => void;
  id?: string;
  label?: string;
  stacked?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const max = maxQuantity({ perPerson: true });
  const commit = (n: number) => onChange(Math.min(max, Math.max(1, Math.round(n) || 1)));
  const box = stacked ? "size-12" : "size-10";
  return (
    <div className={stacked ? "" : "flex items-center gap-2"}>
      <label htmlFor={id ?? "people"} className={`text-xs uppercase tracking-wide text-stone-500 ${stacked ? "block font-bold" : "font-extrabold"}`}>
        {label}
      </label>
      <div className={`inline-flex items-center rounded-lg bg-white ring-1 ring-stone-300 ${stacked ? "mt-1.5" : ""}`}>
        <button type="button" onClick={() => commit(value - 1)} disabled={value <= 1} className={`flex ${box} items-center justify-center rounded-l-lg text-lg font-bold text-ink hover:bg-cream disabled:opacity-30`} aria-label="One less person">
          −
        </button>
        <input
          id={id ?? "people"}
          value={draft ?? String(value)}
          onChange={(e) => {
            const digits = e.target.value.replace(/[^0-9]/g, "").slice(0, 4);
            setDraft(digits);
            if (digits) commit(Number(digits));
          }}
          onBlur={() => setDraft(null)}
          inputMode="numeric"
          className="w-14 bg-transparent text-center text-[16px] font-extrabold tabular-nums text-ink outline-none"
        />
        <button type="button" onClick={() => commit(value + 1)} disabled={value >= max} className={`flex ${box} items-center justify-center rounded-r-lg text-lg font-bold text-ink hover:bg-cream disabled:opacity-30`} aria-label="One more person">
          +
        </button>
      </div>
    </div>
  );
}
