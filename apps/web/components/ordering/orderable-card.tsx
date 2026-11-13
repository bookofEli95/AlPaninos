"use client";

import { useId } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import ItemCard from "@/components/item-card";
import { cart, useCart } from "@/lib/cart";
import { tidyDescription } from "@/lib/format";
import { plainLine, quickAddLine } from "@/lib/ordering/quick-add";
import { useOrdering } from "./ordering-provider";

type CardProps = Omit<Parameters<typeof ItemCard>[0], "idBase">;

// A menu card that opens the item's builder when clicked. Screen readers
// hear its name, price and "Add to Order" (the card's own words), then the
// description.
//
// With `quickAdd` (drinks and extras, which have nothing to choose) a click
// puts one straight in the order, like the app, and once it's there the
// button becomes a - 2 + counter.
export default function OrderableCard({
  item,
  quickAdd,
  ...rest
}: CardProps & { quickAdd?: { category: { id: string; name: string }; store: { id: string; name: string } } }) {
  const { openItem } = useOrdering();
  const id = useId();
  const c = useCart();
  const describedBy = tidyDescription(item.description) ? `${id}-desc` : undefined;

  if (!quickAdd) {
    return (
      <button
        type="button"
        onClick={() => openItem(item.id)}
        aria-labelledby={`${id}-name ${id}-price ${id}-cta`}
        aria-describedby={describedBy}
        className="block h-full w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/40"
      >
        <ItemCard item={item} idBase={id} {...rest} />
      </button>
    );
  }

  const line = plainLine(c.lines, item.id);
  const qty = line?.quantity ?? 0;
  const addOne = () => {
    // An order from another store: the pop-up asks before switching.
    if (c.storeId && c.storeId !== quickAdd.store.id && c.lines.length > 0) return openItem(item.id);
    cart.add(quickAddLine(item, quickAdd.category), quickAdd.store);
  };
  const removeOne = () => line && cart.setQuantity(line.lineId, line.quantity - 1);

  // The counter, in the card's price row once it's in the order. It sits
  // above the card-wide "add one" button, so its own buttons work.
  const counter = (
    <div className="relative z-[2] flex h-[34px] w-[84px] items-center justify-between rounded-lg bg-ink px-0.5 text-white shadow-md sm:w-[104px] sm:px-1">
      <button
        type="button"
        onClick={removeOne}
        aria-label={qty === 1 ? `Remove ${item.name}` : `One less ${item.name}`}
        className="flex size-7 items-center justify-center rounded-md hover:bg-white/15"
      >
        {qty === 1 ? <Trash2 className="size-4" aria-hidden /> : <Minus className="size-4" aria-hidden />}
      </button>
      <span className="text-[15px] font-extrabold tabular-nums" aria-live="polite" aria-label={`${qty} in your order`}>
        {qty}
      </span>
      <button type="button" onClick={addOne} aria-label={`One more ${item.name}`} className="flex size-7 items-center justify-center rounded-md hover:bg-white/15">
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );

  return (
    <div className="group relative h-full">
      <ItemCard item={item} idBase={id} {...rest} cta={qty > 0 ? counter : undefined} />
      {/* The whole card adds one (like the app), under the counter. */}
      <button
        type="button"
        onClick={addOne}
        aria-labelledby={`${id}-name ${id}-price ${qty > 0 ? `${id}-more` : `${id}-cta`}`}
        aria-describedby={describedBy}
        className="absolute inset-0 z-[1] rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/40"
      />
      <span id={`${id}-more`} className="sr-only">
        Add one more
      </span>
    </div>
  );
}
