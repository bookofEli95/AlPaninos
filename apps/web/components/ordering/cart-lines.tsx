"use client";

import { Gift, Pencil, Trash2 } from "lucide-react";
import FoodPhoto from "@/components/food-photo";
import QuantityStepper from "./quantity-stepper";
import { cart, type CartLine } from "@/lib/cart";
import { money } from "@/lib/format";

// "2x Fat Tony, No Onions" from a line's options (repeats folded together).
export function optionSummary(options: { name: string }[]): string {
  const counts = new Map<string, number>();
  options.forEach((o) => counts.set(o.name, (counts.get(o.name) ?? 0) + 1));
  return Array.from(counts, ([name, n]) => (n > 1 ? `${n}× ${name}` : name)).join(", ");
}

// The order's lines, each with its options, notes, price and - n +; used
// by the cart drawer, the menu's order panel and checkout.
export default function CartLines({
  lines,
  onEdit,
  compact = false,
  readOnly = false,
}: {
  lines: CartLine[];
  onEdit?: (line: CartLine) => void;
  compact?: boolean;
  readOnly?: boolean;
}) {
  return (
    <ul className="divide-y divide-stone-200">
      {lines.map((line) => {
        const summary = optionSummary(line.options);
        return (
          <li key={line.lineId} className={`flex gap-3 ${compact ? "py-3" : "py-4"}`}>
            {!compact && <FoodPhoto src={line.imageUrl} alt="" sizes="64px" className="size-16 shrink-0 rounded-lg" />}
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[15px] font-bold leading-snug text-ink">
                  {readOnly && line.quantity > 1 && <span className="text-brand">{line.quantity}× </span>}
                  {line.name}
                </p>
                <p className={`shrink-0 text-[15px] font-bold tabular-nums ${line.rewardCode ? "text-emerald-700" : "text-ink"}`}>{line.rewardCode ? "FREE" : money(line.unitPrice * line.quantity)}</p>
              </div>
              {line.rewardCode && (
                <p className="mt-0.5 inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[12px] font-bold text-emerald-800">
                  <Gift className="size-3" aria-hidden />
                  {line.rewardTitle ?? "Reward"}
                </p>
              )}
              {summary && <p className="mt-0.5 text-[13px] leading-5 text-stone-500">{summary}</p>}
              {line.specialInstructions && <p className="mt-0.5 text-[13px] italic leading-5 text-stone-500">&ldquo;{line.specialInstructions}&rdquo;</p>}
              {!readOnly && (
                <div className="mt-2.5 flex items-center gap-3">
                  {line.rewardCode ? (
                    <button type="button" onClick={() => cart.remove(line.lineId)} className="inline-flex items-center gap-1 text-[13px] font-bold text-stone-500 hover:text-brand">
                      <Trash2 className="size-3.5" aria-hidden />
                      Remove
                    </button>
                  ) : (
                    <QuantityStepper size="sm" removable value={line.quantity} onChange={(n) => cart.setQuantity(line.lineId, n)} label={`${line.name} quantity`} />
                  )}
                  {onEdit && (
                    <button type="button" onClick={() => onEdit(line)} className="inline-flex items-center gap-1 text-[13px] font-bold text-brand hover:underline">
                      <Pencil className="size-3.5" aria-hidden />
                      Edit
                    </button>
                  )}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
