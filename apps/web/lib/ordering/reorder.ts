"use client";

import { browserSupabase } from "@/lib/browser-supabase";
import type { CartLine } from "@/lib/cart";

type Row = {
  location_id: string;
  locations: { name: string } | null;
  order_items: {
    quantity: number;
    special_instructions: string | null;
    menu_items: {
      id: string;
      name: string;
      base_price: number;
      image_url: string | null;
      category_id: string;
      is_catering: boolean | null;
      per_person?: boolean | null;
      is_available: boolean | null;
      drop_ends_at: string | null;
      menu_categories: { name: string } | null;
    } | null;
    order_item_modifiers: { modifier_options: { id: string; name: string; price_adjustment: number } | null }[];
  }[];
};

// "Order Again": a past order rebuilt as lines for the cart, at today's
// prices -- anything no longer on the menu (or an option that's gone) is
// left out and named, so the customer knows.
export async function linesFromOrder(orderId: string): Promise<{ store: { id: string; name: string }; lines: Omit<CartLine, "lineId">[]; skipped: string[] }> {
  const { data, error } = await browserSupabase()
    .from("orders")
    .select(
      `location_id, locations ( name ), order_items ( quantity, special_instructions,
        menu_items ( *, menu_categories ( name ) ),
        order_item_modifiers ( modifier_options ( id, name, price_adjustment ) ) )`
    )
    .eq("id", orderId)
    .single();
  if (error) throw error;
  const order = data as unknown as Row;
  const lines: Omit<CartLine, "lineId">[] = [];
  const skipped: string[] = [];
  for (const line of order.order_items) {
    const item = line.menu_items;
    const options = line.order_item_modifiers.map((m) => m.modifier_options);
    const ended = !!item?.drop_ends_at && Date.parse(item.drop_ends_at) <= Date.now();
    if (!item || item.is_available === false || ended || options.some((o) => !o)) {
      skipped.push(item?.name ?? "An item");
      continue;
    }
    const picked = options.map((o) => ({ optionId: o!.id, name: o!.name, price: Number(o!.price_adjustment) }));
    lines.push({
      menuItemId: item.id,
      name: item.name,
      categoryId: item.category_id,
      categoryName: item.menu_categories?.name ?? "",
      imageUrl: item.image_url,
      isCatering: !!item.is_catering,
      ...(item.per_person ? { perPerson: true } : {}),
      options: picked,
      unitPrice: Number(item.base_price) + picked.reduce((sum, o) => sum + o.price, 0),
      quantity: line.quantity,
      specialInstructions: line.special_instructions ?? undefined,
    });
  }
  return { store: { id: order.location_id, name: order.locations?.name ?? "" }, lines, skipped };
}
