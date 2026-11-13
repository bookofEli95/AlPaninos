import type { CartLine } from "@/lib/cart";

// Drinks and extras have nothing to choose, so (as in the app) they go
// straight into the order -- no pop-up -- and their card turns into a
// - 2 + counter.
const QUICK_ADD_CATEGORIES = ["Extras", "Drinks"];

export const isQuickAdd = (categoryName?: string | null) => !!categoryName && QUICK_ADD_CATEGORIES.includes(categoryName);

export function quickAddLine(
  item: { id: string; name: string; base_price: number; image_url: string | null },
  category: { id: string; name: string }
): Omit<CartLine, "lineId"> {
  return {
    menuItemId: item.id,
    name: item.name,
    categoryId: category.id,
    categoryName: category.name,
    imageUrl: item.image_url,
    isCatering: false,
    options: [],
    unitPrice: Number(item.base_price),
    quantity: 1,
  };
}

// The order's plain line for this item (no notes, not a reward), if any.
export const plainLine = (lines: CartLine[], itemId: string) =>
  lines.find((l) => l.menuItemId === itemId && l.options.length === 0 && !l.specialInstructions && !l.rewardCode);
