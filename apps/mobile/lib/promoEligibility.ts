import { supabase } from './supabase';

// Categories are duplicated per-location (see the second-location
// migration), so a promo that only knows a category NAME (e.g. a wheel-won
// prize -- see the spin_wheel migration) has to be resolved against
// whichever location the cart is currently ordering from, rather than a
// fixed category_id that would only ever match one location's copy.
// Staff-authored promotions (created with a concrete category_id) skip this
// entirely and just use that id directly.
export async function resolvePromoCategoryId(
  promo: { category_id: string | null; category_name: string | null },
  locationId: string
): Promise<string | null> {
  if (promo.category_id) return promo.category_id;
  if (!promo.category_name) return null;
  const { data } = await supabase
    .from('menu_categories')
    .select('id')
    .eq('location_id', locationId)
    .ilike('name', promo.category_name)
    .maybeSingle();
  return data?.id ?? null;
}

export function computeEligibleDiscount(
  items: { menuItemId: string; totalPrice: number }[],
  promo: {
    discountPercent: number;
    categoryId: string | null;
    itemNamePatterns?: string[] | null;
    maxDiscountAmount?: number | null;
  },
  menuItemInfoMap: Record<string, { categoryId: string; name: string }>
): number {
  const eligibleItems = items.filter((item) => {
    const info = menuItemInfoMap[item.menuItemId];
    if (promo.categoryId && info?.categoryId !== promo.categoryId) return false;
    if (promo.itemNamePatterns && promo.itemNamePatterns.length > 0) {
      const name = (info?.name ?? '').trim().toLowerCase();
      if (!promo.itemNamePatterns.some((pattern) => name === pattern.trim().toLowerCase())) return false;
    }
    return true;
  });
  const eligibleSubtotal = eligibleItems.reduce((sum, item) => sum + item.totalPrice, 0);
  const rawDiscount = eligibleSubtotal * (promo.discountPercent / 100);
  return promo.maxDiscountAmount != null ? Math.min(rawDiscount, promo.maxDiscountAmount) : rawDiscount;
}
