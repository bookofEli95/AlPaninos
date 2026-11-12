"use client";

import ItemCard from "@/components/item-card";
import { useOrdering } from "./ordering-provider";

type CardItem = Parameters<typeof ItemCard>[0]["item"];

// A menu card that opens the item's builder when clicked.
export default function OrderableCard({ item, ...rest }: Parameters<typeof ItemCard>[0] & { item: CardItem }) {
  const { openItem } = useOrdering();
  return (
    <button
      type="button"
      onClick={() => openItem(item.id)}
      className="block h-full w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/40"
    >
      <ItemCard item={item} {...rest} />
    </button>
  );
}
