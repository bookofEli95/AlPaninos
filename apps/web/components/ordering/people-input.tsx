"use client";

import { useState } from "react";
import { maxQuantity } from "@/lib/cart";

// "People" for a per-person package: typed (up to 1,000), or - / +.
export default function PeopleInput({ value, onChange, id }: { value: number; onChange: (n: number) => void; id?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const max = maxQuantity({ perPerson: true });
  const commit = (n: number) => onChange(Math.min(max, Math.max(1, Math.round(n) || 1)));
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id ?? "people"} className="text-[12px] font-extrabold uppercase tracking-wide text-stone-500">
        People
      </label>
      <div className="inline-flex items-center rounded-lg bg-white ring-1 ring-stone-300">
        <button type="button" onClick={() => commit(value - 1)} disabled={value <= 1} className="flex size-10 items-center justify-center rounded-l-lg text-lg font-bold text-ink hover:bg-cream disabled:opacity-30" aria-label="One less person">
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
        <button type="button" onClick={() => commit(value + 1)} disabled={value >= max} className="flex size-10 items-center justify-center rounded-r-lg text-lg font-bold text-ink hover:bg-cream disabled:opacity-30" aria-label="One more person">
          +
        </button>
      </div>
    </div>
  );
}
