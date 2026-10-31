"use client";

import { Minus, Plus, Trash2 } from "lucide-react";

// [-] n [+]. With `removable`, the minus becomes a bin at 1.
export default function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  removable = false,
  size = "md",
  label = "Quantity",
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  removable?: boolean;
  size?: "sm" | "md";
  label?: string;
}) {
  const box = size === "sm" ? "size-8" : "size-10";
  const icon = size === "sm" ? "size-3.5" : "size-4";
  const showBin = removable && value <= 1;
  return (
    <div className="inline-flex items-center rounded-lg bg-white ring-1 ring-stone-300" role="group" aria-label={label}>
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        disabled={!removable && value <= min}
        className={`${box} flex items-center justify-center rounded-l-lg text-ink transition-colors hover:bg-cream disabled:opacity-30 disabled:hover:bg-transparent`}
        aria-label={showBin ? "Remove" : "One less"}
      >
        {showBin ? <Trash2 className={`${icon} text-brand`} /> : <Minus className={icon} />}
      </button>
      <span className={`min-w-8 text-center font-extrabold tabular-nums text-ink ${size === "sm" ? "text-[13px]" : "text-[15px]"}`} aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        className={`${box} flex items-center justify-center rounded-r-lg text-ink transition-colors hover:bg-cream disabled:opacity-30 disabled:hover:bg-transparent`}
        aria-label="One more"
      >
        <Plus className={icon} />
      </button>
    </div>
  );
}
