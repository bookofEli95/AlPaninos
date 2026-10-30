import Image from "next/image";
import { UtensilsCrossed } from "lucide-react";

// A menu photo filling its box -- or, for an item without one yet, a calm
// cream panel with a utensils mark instead of a broken image.
export default function FoodPhoto({
  src,
  alt,
  sizes,
  priority = false,
  className = "",
}: {
  src: string | null | undefined;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  if (!src) {
    return (
      <div className={`flex items-center justify-center bg-cream-deep ${className}`} aria-hidden>
        <UtensilsCrossed className="size-8 text-stone-300" strokeWidth={1.5} />
      </div>
    );
  }
  return (
    <div className={`relative overflow-hidden bg-cream-deep ${className}`}>
      <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className="object-cover" />
    </div>
  );
}
