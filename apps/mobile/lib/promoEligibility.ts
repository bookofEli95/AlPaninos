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

// promotions.single_use defaults to true (see the promo_single_use
// migration) -- every code is one-time-per-account unless a staffer
// explicitly flips it off in Studio. A past redemption is read straight off
// orders.promo_code (already set at checkout, see cart.tsx) rather than a
// separate redemption table, since that's already the exact record of what
// this account has used.
export async function hasUserRedeemedCode(userId: string, code: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .ilike('promo_code', code);
  if (error) return false;
  return (count ?? 0) > 0;
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
