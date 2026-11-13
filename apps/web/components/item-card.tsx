import type { ReactNode } from "react";
import FoodPhoto from "./food-photo";
import { money, tidyDescription } from "@/lib/format";

// A menu item as a website product card: a wide photo, the name, a short
// description, and the price with an "Add to Order" button along the
// bottom. Cards in a row line up at the bottom. It sits inside the card's
// button, which takes its name from the parts with ids from `idBase`.
export default function ItemCard({
  item,
  idBase,
  badge,
  priority = false,
  sizes = "(min-width: 1280px) 300px, (min-width: 768px) 33vw, 50vw",
  cta,
}: {
  item: { id: string; name: string; description?: string | null; base_price: number; image_url: string | null };
  idBase: string;
  badge?: string | null;
  priority?: boolean;
  sizes?: string;
  // In place of the "Add to Order" button (a quick-add card's counter).
  cta?: ReactNode;
}) {
  const description = tidyDescription(item.description);
  return (
    <div className="group flex h-full flex-col overflow-hidden rounded-xl bg-white ring-1 ring-stone-200 transition-shadow duration-300 hover:shadow-[0_12px_32px_-12px_rgba(0,0,0,0.25)]">
      <div className="relative overflow-hidden">
        <FoodPhoto
          src={item.image_url}
          // The name is right under the photo (and the whole card is one
          // button), so the photo itself stays quiet for screen readers.
          alt=""
          sizes={sizes}
          priority={priority}
          className="aspect-[4/3] w-full transition-transform duration-500 group-hover:scale-[1.04]"
        />
        {!!badge && (
          <span className="absolute left-0 top-3 rounded-r-md bg-gold px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide text-wine">
            {badge}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <h3 id={`${idBase}-name`} className="font-display text-[16px] font-extrabold leading-snug text-ink sm:text-[17px]">
          {item.name}
        </h3>
        {!!description && (
          <p id={`${idBase}-desc`} className="mt-1.5 line-clamp-2 text-[13px] leading-5 text-stone-500 sm:text-[14px]">
            {description}
          </p>
        )}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
          <span id={`${idBase}-price`} className="text-[16px] font-extrabold text-ink tabular-nums sm:text-[17px]">
            {money(item.base_price)}
          </span>
          {cta ?? (
            <span id={`${idBase}-cta`} className="rounded-lg bg-brand px-3.5 py-2 text-[13px] font-extrabold uppercase tracking-wide text-white transition-colors group-hover:bg-brand-dark sm:px-4">
              <span className="sm:hidden">Add</span>
              <span className="hidden sm:inline">Add to Order</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
