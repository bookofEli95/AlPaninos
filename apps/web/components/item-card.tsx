import { Plus } from "lucide-react";
import FoodPhoto from "./food-photo";
import { money, tidyDescription } from "@/lib/format";

// One menu item: its photo, name, a short description and the price, with a
// round + to add it. Cards in a row are the same height, prices along the
// bottom (as on the app's menu tiles).
export default function ItemCard({
  item,
  badge,
  priority = false,
}: {
  item: { id: string; name: string; description?: string | null; base_price: number; image_url: string | null };
  badge?: string | null;
  priority?: boolean;
}) {
  const description = tidyDescription(item.description);
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-[1.4rem] border border-stone-200 bg-white shadow-sm shadow-black/[0.03] transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/[0.07]">
      <div className="relative">
        <FoodPhoto
          src={item.image_url}
          alt={item.name}
          sizes="(min-width: 1280px) 280px, (min-width: 768px) 33vw, 50vw"
          priority={priority}
          className="aspect-[4/3] w-full transition-transform duration-500 group-hover:scale-[1.03]"
        />
        {!!badge && (
          <span className="absolute left-3 top-3 rounded-full bg-gold px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-wine shadow-sm">
            {badge}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <h3 className="font-display text-[17px] font-extrabold leading-snug tracking-tight text-ink">{item.name}</h3>
        {!!description && <p className="mt-1.5 line-clamp-2 text-[13.5px] leading-5 text-stone-500">{description}</p>}
        <div className="flex-1" />
        <div className="mt-4 flex items-center justify-between">
          <span className="text-[17px] font-extrabold text-brand tabular-nums">{money(item.base_price)}</span>
          <span
            className="flex size-10 items-center justify-center rounded-full bg-brand text-cream-deep shadow-md shadow-brand/25 transition-transform duration-200 group-hover:scale-105"
            aria-hidden
          >
            <Plus className="size-5" strokeWidth={2.5} />
          </span>
        </div>
      </div>
    </article>
  );
}
