import "server-only";
import { publicSupabase } from "./supabase";
import type { WeekHours } from "./hours";

// What the website reads from the app's database -- the same tables and
// rules, so the website and the app always show the same menu.

export type Store = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  hours: WeekHours | null;
  latitude: number | null;
  longitude: number | null;
  tax_rate: number | null;
};

export type Category = {
  id: string;
  name: string;
  sort_order: number | null;
  image_url: string | null;
  is_catering: boolean;
  is_secret: boolean;
};

export type MenuItem = {
  id: string;
  category_id: string;
  location_id: string;
  name: string;
  description: string | null;
  base_price: number;
  image_url: string | null;
  is_catering?: boolean;
  serves_min?: number | null;
  serves_max?: number | null;
  drop_starts_at?: string | null;
  drop_ends_at?: string | null;
};

export type PopularItem = Pick<MenuItem, "id" | "name" | "base_price" | "image_url" | "location_id"> & {
  description?: string | null;
  sold: number;
};

export async function getStores(): Promise<Store[]> {
  const { data, error } = await publicSupabase()
    .from("locations")
    .select("id, name, address, phone, hours, latitude, longitude, tax_rate")
    .order("name");
  if (error) throw error;
  return (data ?? []) as Store[];
}

// The store a page shows when none is picked: the one asked for, if it
// exists, otherwise the first.
export function pickStore(stores: Store[], id?: string | null): Store | null {
  return stores.find((s) => s.id === id) ?? stores[0] ?? null;
}

// A limited-time drop that has ended is hidden; one that hasn't started is
// shown but not orderable (the app's lib/drops.ts).
const dropEnded = (item: MenuItem, now = Date.now()) => !!item.drop_ends_at && now >= new Date(item.drop_ends_at).getTime();

export async function getMenu(storeId: string): Promise<{ categories: Category[]; items: MenuItem[] }> {
  const supabase = publicSupabase();
  const [categories, items] = await Promise.all([
    supabase.from("menu_categories").select("*").eq("location_id", storeId).order("sort_order"),
    supabase.from("menu_items").select("*").eq("location_id", storeId).eq("is_available", true),
  ]);
  if (categories.error) throw categories.error;
  if (items.error) throw items.error;
  return {
    categories: (categories.data ?? []) as Category[],
    items: ((items.data ?? []) as MenuItem[]).filter((i) => !dropEnded(i)),
  };
}

// This store's best sellers over the last 60 days (get_popular_items). With
// too few orders yet it's the signature sandwiches -- `isReal` says which.
export async function getPopular(storeId: string, limit = 8): Promise<{ items: PopularItem[]; isReal: boolean }> {
  const { data, error } = await publicSupabase().rpc("get_popular_items", { p_location_id: storeId, p_limit: limit });
  if (error) throw error;
  const items = (data ?? []) as PopularItem[];
  return { items, isReal: Number(items[0]?.sold ?? 0) >= 3 };
}

// The everyday menu: what isn't catering (its own page) or the app-only
// Secret Mob.
export function everydayMenu(menu: { categories: Category[]; items: MenuItem[] }) {
  const categories = menu.categories.filter((c) => !c.is_catering && !c.is_secret);
  return categories
    .map((category) => ({
      category,
      items: menu.items
        .filter((i) => i.category_id === category.id)
        .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" })),
    }))
    .filter((section) => section.items.length > 0);
}
