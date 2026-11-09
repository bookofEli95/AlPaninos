"use client";

import { Check } from "lucide-react";
import QuantityStepper from "./quantity-stepper";
import { minFor, type ChoiceGroup, type Selections } from "@/lib/ordering/choices";
import { money, tidyDescription } from "@/lib/format";

// An item's choice groups: "Required" until done, "Choose 1" / "Up to 4",
// radio or tick boxes, and - n + for groups that take quantities. Used by
// the item builder and the catering form.
export default function ChoiceGroups({
  groups,
  selections,
  showErrors,
  onToggle,
  onCount,
  idPrefix = "group-",
  insetFirst = false,
  perPerson = false,
  className = "border-b border-stone-200 px-5 py-5 sm:px-7",
}: {
  groups: ChoiceGroup[];
  selections: Selections;
  showErrors: boolean;
  onToggle: (group: ChoiceGroup, optionId: string) => void;
  onCount: (group: ChoiceGroup, optionId: string, delta: 1 | -1) => void;
  idPrefix?: string;
  // Room on the first row for the dialog's close button.
  insetFirst?: boolean;
  // Prices read "+$4.00 / person".
  perPerson?: boolean;
  className?: string;
}) {
  const per = perPerson ? " / person" : "";
  return (
    <>
      {groups.map((group, index) => {
        const picked = selections[group.id] ?? [];
        const min = minFor(group);
        const single = group.max_selections === 1;
        const short = picked.length < min;
        return (
          <fieldset key={group.id} id={`${idPrefix}${group.id}`} className={`scroll-mt-28 ${className}`}>
            <legend className="contents">
              <div className={`flex flex-wrap items-center justify-between gap-2 ${index === 0 && insetFirst ? "lg:pr-12" : ""}`}>
                <span className="flex items-center gap-2">
                  <span className="text-[17px] font-extrabold text-ink">{group.name}</span>
                  {min > 0 && (
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide ${
                        !short ? "bg-emerald-50 text-emerald-700" : showErrors ? "bg-brand text-white" : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {short ? "Required" : <Check className="size-3.5" aria-label="Done" />}
                    </span>
                  )}
                </span>
                <span className="text-[13px] font-medium text-stone-500">
                  {single
                    ? "Choose 1"
                    : group.max_selections && min === group.max_selections
                    ? `${picked.length} of ${group.max_selections} chosen`
                    : group.max_selections
                    ? `Up to ${group.max_selections}`
                    : "Optional"}
                </span>
              </div>
            </legend>
            {group.options.length === 0 && <p className="mt-3 text-[14px] text-stone-500">No choices are available for this right now.</p>}
            <div className="mt-3.5 grid gap-2 sm:grid-cols-2">
              {group.options.map((option) => {
                const count = picked.filter((id) => id === option.id).length;
                const price = Number(option.price_adjustment);
                if (group.allow_quantity) {
                  const full = !!group.max_selections && picked.length >= group.max_selections;
                  return (
                    <div
                      key={option.id}
                      className={`flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 ring-1 transition-colors sm:col-span-2 ${count > 0 ? "bg-white ring-2 ring-brand" : "bg-white ring-stone-200"}`}
                    >
                      <div className="min-w-0">
                        <p className={`text-[14px] ${count > 0 ? "font-bold text-ink" : "font-medium text-stone-800"}`}>{option.name}</p>
                        {price > 0 && <p className="text-[13px] font-bold text-brand">+{money(price)} each</p>}
                        {option.description && <p className="mt-0.5 line-clamp-2 text-[13px] text-stone-500">{tidyDescription(option.description)}</p>}
                      </div>
                      <QuantityStepper size="sm" value={count} min={0} max={full ? count : 99} onChange={(n) => onCount(group, option.id, n > count ? 1 : -1)} label={option.name} />
                    </div>
                  );
                }
                const on = count > 0;
                return (
                  <label
                    key={option.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl px-3.5 py-3 ring-1 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink ${
                      on ? "bg-white ring-2 ring-brand" : "bg-white ring-stone-200 hover:ring-stone-400"
                    }`}
                  >
                    <input
                      type={single ? "radio" : "checkbox"}
                      name={`${idPrefix}${group.id}`}
                      checked={on}
                      onChange={() => onToggle(group, option.id)}
                      onClick={() => {
                        // A picked choice in an optional pick-one group unpicks.
                        if (single && on && min === 0) onToggle(group, option.id);
                      }}
                      className="sr-only"
                    />
                    <span
                      aria-hidden
                      className={`flex size-5 shrink-0 items-center justify-center border transition-colors ${single ? "rounded-full" : "rounded-md"} ${
                        on ? "border-brand bg-brand" : "border-stone-300 bg-stone-50"
                      }`}
                    >
                      {on && (single ? <span className="size-2 rounded-full bg-white" /> : <Check className="size-3.5 text-white" strokeWidth={3} />)}
                    </span>
                    <span className="flex-1 text-[14px] font-medium text-stone-800">{option.name}</span>
                    {price > 0 && (
                      <span className={`whitespace-nowrap text-[13px] font-bold ${on ? "text-brand" : "text-stone-500"}`}>
                        +{money(price)}
                        {per}
                      </span>
                    )}
                    {price < 0 && <span className={`whitespace-nowrap text-[13px] font-bold ${on ? "text-emerald-700" : "text-stone-500"}`}>−{money(-price)}{per}</span>}
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </>
  );
}
