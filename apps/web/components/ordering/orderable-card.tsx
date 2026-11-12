"use client";

import { useId } from "react";
import ItemCard from "@/components/item-card";
import { tidyDescription } from "@/lib/format";
import { useOrdering } from "./ordering-provider";

type CardProps = Omit<Parameters<typeof ItemCard>[0], "idBase">;

// A menu card that opens the item's builder when clicked. Screen readers
// hear its name, price and "Add to Order" (the card's own words), then the
// description.
export default function OrderableCard({ item, ...rest }: CardProps) {
  const { openItem } = useOrdering();
  const id = useId();
  return (
    <button
      type="button"
      onClick={() => openItem(item.id)}
      aria-labelledby={`${id}-name ${id}-price ${id}-cta`}
      aria-describedby={tidyDescription(item.description) ? `${id}-desc` : undefined}
      className="block h-full w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/40"
    >
      <ItemCard item={item} idBase={id} {...rest} />
    </button>
  );
}
