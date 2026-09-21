import { supabase } from './supabase';
import { resolvePromoCategoryId } from './promoEligibility';

export type EligiblePrizeItem = {
  id: string;
  name: string;
  base_price: number;
  image_url: string | null;
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
    .select('id, name, base_price, image_url')
    .eq('location_id', locationId)
    .eq('category_id', categoryId)
    .eq('is_available', true);
  if (error || !data) return [];

  if (!promo.item_name_patterns || promo.item_name_patterns.length === 0) return data;

  const patterns = promo.item_name_patterns.map((p) => p.trim().toLowerCase());
  return data.filter((item) => patterns.includes(item.name.trim().toLowerCase()));
}

export async function itemHasModifiers(itemId: string): Promise<boolean> {
  const { count } = await supabase
    .from('modifier_groups')
    .select('id', { count: 'exact', head: true })
    .eq('menu_item_id', itemId);
  return (count ?? 0) > 0;
}
