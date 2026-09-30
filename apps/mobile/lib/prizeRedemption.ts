import { supabase } from './supabase';
import { resolvePromoCategoryId } from './promoEligibility';

export type EligiblePrizeItem = {
  id: string;
  name: string;
  base_price: number;
  image_url: string | null;
  description: string | null;
};

// A promo counts as a "pick a specific free item" reward (Free Choice of
// Pop, Free Specialty Fries, Free Mob Sandwich, Free Fries) rather than a
// generic cart-wide coupon (25% Off Next Order, GRAND PRIZE) when it's a
// 100%-off code scoped to a category -- purely data-driven, so this covers
// every current and future reward shape (wheel-won or points-redeemed, see
// the panino_points migration -- both land in promotions the same way)
// without hardcoding by title.
export function isPickAnItemPrize(promo: { discount_percent: number | null; category_name: string | null }): boolean {
  return Number(promo.discount_percent) === 100 && !!promo.category_name;
}

// Every item this promo could apply to, at the given location -- exactly
// the same category_name + item_name_patterns scoping cart.tsx already
// uses to compute the discount, just resolved into a pickable item list
// instead of applied against whatever's already in the cart.
export async function fetchEligiblePrizeItems(
  promo: { category_id: string | null; category_name: string | null; item_name_patterns: string[] | null },
  locationId: string
): Promise<EligiblePrizeItem[]> {
  const categoryId = await resolvePromoCategoryId(promo, locationId);
  if (!categoryId) return [];

  const { data, error } = await supabase
    .from('menu_items')
    .select('id, name, base_price, image_url, description')
    .eq('location_id', locationId)
    .eq('category_id', categoryId)
    .eq('is_available', true);
  if (error || !data) return [];

  if (!promo.item_name_patterns || promo.item_name_patterns.length === 0) return data;

  const patterns = promo.item_name_patterns.map((p) => p.trim().toLowerCase());
  return data.filter((item) => patterns.includes(item.name.trim().toLowerCase()));
}

// A real photo of (roughly) what was won, for the wheel's win popup --
// grabbed by category name across every location rather than a resolved
// category_id, since this runs before the customer has necessarily picked a
// location (the wheel shows right after signup, ahead of the usual
// location/menu flow -- see app/_layout.tsx). Purely decorative: picking a
// location's copy of an item at random is fine here in a way it never would
// be for eligibility/pricing.
export async function fetchPrizeShowcaseImage(
  categoryName: string,
  itemNamePatterns?: string[] | null
): Promise<string | null> {
  const { data: categories } = await supabase
    .from('menu_categories')
    .select('id')
    .ilike('name', categoryName);
  const categoryIds = (categories || []).map((c: any) => c.id);
  if (categoryIds.length === 0) return null;

  const { data: items } = await supabase
    .from('menu_items')
    .select('name, image_url')
    .in('category_id', categoryIds)
    .eq('is_available', true)
    .not('image_url', 'is', null);
  if (!items || items.length === 0) return null;

  const patterns = (itemNamePatterns || []).map((p) => p.trim().toLowerCase());
  const matching = patterns.length > 0
    ? items.filter((item: any) => patterns.includes(item.name.trim().toLowerCase()))
    : items;

  const pool = matching.length > 0 ? matching : items;
  return (pool[0] as any)?.image_url ?? null;
}

export async function itemHasModifiers(itemId: string): Promise<boolean> {
  const { count } = await supabase
    .from('modifier_groups')
    .select('id', { count: 'exact', head: true })
    .eq('menu_item_id', itemId);
  return (count ?? 0) > 0;
}

// Whether a free reward item goes straight into the cart, or opens its own
// screen first. It opens its screen unless it's a drink with nothing to
// choose -- so a free sandwich (or side, or dip) can still get its options
// and kitchen notes ("no onions"). Drinks have no notes to add.
export async function rewardNeedsItemScreen(itemId: string, promo: { category_name?: string | null }): Promise<boolean> {
  if ((promo.category_name ?? '').trim().toLowerCase() !== 'drinks') return true;
  return itemHasModifiers(itemId);
}

// A-to-Z by name (ignoring case and accents; "Item 2" before "Item 10") --
// every pick list (reward items, Mix & Match meals) is shown this way.
export function byName<T extends { name?: string | null }>(a: T, b: T): number {
  return String(a.name ?? '').localeCompare(String(b.name ?? ''), undefined, { sensitivity: 'base', numeric: true });
}
