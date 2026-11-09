import "server-only";
import { publicSupabase } from "./supabase";
import type { ChoiceGroup, ChoiceOption } from "./ordering/choices";

// The catering packages (priced per person) at every store, each with its
// choice groups -- loaded with the page, so the catering form opens on the
// spot instead of fetching as it's used.

export type CateringPackage = {
  id: string;
  location_id: string;
  category_id: string;
  category_name: string;
  name: string;
  description: string | null;
  base_price: number;
  image_url: string | null;
  groups: ChoiceGroup[];
};

type ItemRow = {
  id: string;
  location_id: string;
  category_id: string;
  name: string;
  description: string | null;
  base_price: number;
  image_url: string | null;
  per_person?: boolean | null;
  menu_categories: { name: string } | null;
};

export async function getCateringPackages(storeIds: string[]): Promise<CateringPackage[]> {
  if (!storeIds.length) return [];
  const supabase = publicSupabase();
  const { data: items, error } = await supabase
    .from("menu_items")
    .select("*, menu_categories(name)")
    .in("location_id", storeIds)
    .eq("is_catering", true)
    .eq("is_available", true)
    .order("base_price");
  if (error) throw error;
  // Only per-person packages belong on the form (until the catering menu
  // update is in the database, there are none and the page says to call).
  const packages = ((items ?? []) as ItemRow[]).filter((i) => i.per_person === true);
  if (!packages.length) return [];

  const { data: groups, error: groupsError } = await supabase
    .from("modifier_groups")
    .select("*")
    .in(
      "menu_item_id",
      packages.map((p) => p.id)
    )
    .order("sort_order");
  if (groupsError) throw groupsError;
  let options: ChoiceOption[] = [];
  if (groups?.length) {
    const { data, error: optionsError } = await supabase
      .from("modifier_options")
      .select("*")
      .in(
        "group_id",
        groups.map((g) => g.id)
      )
      .order("sort_order");
    if (optionsError) throw optionsError;
    options = (data ?? []) as ChoiceOption[];
  }

  return packages.map((p) => ({
    id: p.id,
    location_id: p.location_id,
    category_id: p.category_id,
    category_name: p.menu_categories?.name ?? "Catering",
    name: p.name,
    description: p.description,
    base_price: Number(p.base_price),
    image_url: p.image_url,
    groups: (groups ?? [])
      .filter((g) => g.menu_item_id === p.id)
      .map((g) => ({
        id: g.id,
        name: g.name,
        parent_option_id: g.parent_option_id ?? null,
        is_required: g.is_required,
        min_selections: g.min_selections,
        max_selections: g.max_selections,
        allow_quantity: !!g.allow_quantity,
        options: options
          .filter((o) => o.group_id === g.id)
          .map((o) => ({ id: o.id, group_id: o.group_id, name: o.name, price_adjustment: Number(o.price_adjustment), is_default: o.is_default })),
      })),
  }));
}

// The regular menu's descriptions by name, for the sandwiches Al picks
// from ("Virgin Mary (vegetarian)" matches "Virgin Mary").
export async function getSandwichDescriptions(storeId: string, names: string[]): Promise<Record<string, string>> {
  if (!names.length) return {};
  const { data } = await publicSupabase().from("menu_items").select("name, description").eq("location_id", storeId).eq("is_catering", false);
  const byName = new Map((data ?? []).map((m) => [String(m.name).trim().toLowerCase(), (m.description as string | null) ?? ""]));
  const out: Record<string, string> = {};
  for (const name of names) {
    const plain = name.replace(/\s*\(.*\)\s*$/, "").trim().toLowerCase();
    const found = byName.get(name.trim().toLowerCase()) ?? byName.get(plain);
    if (found) out[name] = found;
  }
  return out;
}
