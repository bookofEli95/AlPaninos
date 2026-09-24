import { supabase } from './supabase';
import type { AppliedPromo } from '../store/promoStore';

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

// The one place a promotions row becomes an AppliedPromo -- Deals (tap to
// apply) and the Cart (typed code) both go through this, so neither can
// forget a rule the other enforces.
export function appliedPromoFromRow(row: any): AppliedPromo {
  const num = (v: any) => (v != null ? Number(v) : null);
  return {
    code: row.code,
    title: row.title,
    discountPercent: num(row.discount_percent),
    amountOff: num(row.amount_off),
    categoryId: row.category_id ?? null,
    categoryName: row.category_name ?? null,
    categoryNames: row.category_names?.length ? row.category_names : null,
    itemNamePatterns: row.item_name_patterns?.length ? row.item_name_patterns : null,
    maxDiscountAmount: num(row.max_discount_amount),
    minOrderAmount: num(row.min_order_amount),
    minItemCount: row.min_item_count != null ? Number(row.min_item_count) : null,
    orderType: row.order_type ?? null,
  };
}

// Whether the promo only applies to some categories (and so needs
// resolving against a location's menu before it can be priced).
export function hasCategoryScope(promo: AppliedPromo): boolean {
  return !!(promo.categoryId || promo.categoryName || promo.categoryNames?.length);
}

function scopeCategoryNames(promo: AppliedPromo): string[] {
  return [...(promo.categoryNames ?? []), ...(promo.categoryName ? [promo.categoryName] : [])];
}

// The promo's category scope as concrete category ids at one location --
// null when it isn't category-scoped at all (whole cart). Names are matched
// case-insensitively against that location's categories in code rather
// than in a query filter, since names like "Al's Wraps" contain characters
// PostgREST's or() syntax doesn't escape well.
export async function resolvePromoCategoryIds(promo: AppliedPromo, locationId: string): Promise<string[] | null> {
  if (!hasCategoryScope(promo)) return null;
  if (promo.categoryId) return [promo.categoryId];
  const wanted = scopeCategoryNames(promo).map((n) => n.trim().toLowerCase());
  const { data } = await supabase.from('menu_categories').select('id, name').eq('location_id', locationId);
  return (data ?? []).filter((c: any) => wanted.includes(String(c.name).trim().toLowerCase())).map((c: any) => c.id);
}

export type PromoEvaluation = {
  discount: number;
  // Why the deal isn't taking anything off yet, phrased as what to do
  // about it ("Add $4.50 more to unlock this deal.") -- null once it applies.
  unmetReason: string | null;
};

const money = (n: number) => `$${n.toFixed(2)}`;

// Prices a promo against the cart, Domino's-style: every rule is checked
// live, so dropping under a minimum or switching pickup -> delivery takes the
// discount back to $0 (with the reason) and meeting it again restores it.
// categoryIds is the promo's scope already resolved for the cart's location
// (resolvePromoCategoryIds) -- null means the whole cart.
export function evaluatePromo(
  items: { menuItemId: string; totalPrice: number; quantity: number; promoCode?: string }[],
  promo: AppliedPromo,
  categoryIds: string[] | null,
  menuItemInfoMap: Record<string, { categoryId: string; name: string }>,
  orderType: 'pickup' | 'delivery'
): PromoEvaluation {
  if (promo.orderType && promo.orderType !== orderType) {
    return { discount: 0, unmetReason: `This deal is for ${promo.orderType} orders only -- switch to ${promo.orderType} to use it.` };
  }

  // Free reward lines (wheel/points prizes) are already $0 and shouldn't
  // count toward "buy 2" -- a free sandwich plus one paid one isn't two.
  const paidItems = items.filter((item) => !item.promoCode);
  const eligibleItems = paidItems.filter((item) => {
    const info = menuItemInfoMap[item.menuItemId];
    if (categoryIds && !(info && categoryIds.includes(info.categoryId))) return false;
    if (promo.itemNamePatterns && promo.itemNamePatterns.length > 0) {
      const name = (info?.name ?? '').trim().toLowerCase();
      if (!promo.itemNamePatterns.some((pattern) => name === pattern.trim().toLowerCase())) return false;
    }
    return true;
  });
  const eligibleCount = eligibleItems.reduce((sum, item) => sum + item.quantity, 0);
  const eligibleSubtotal = eligibleItems.reduce((sum, item) => sum + item.totalPrice, 0);
  const cartSubtotal = paidItems.reduce((sum, item) => sum + item.totalPrice, 0);

  const names = scopeCategoryNames(promo);
  const fromScope = categoryIds && names.length ? ` from ${names.join(' or ')}` : categoryIds ? ' that qualifies' : '';

  if (promo.minItemCount && eligibleCount < promo.minItemCount) {
    const missing = promo.minItemCount - eligibleCount;
    return { discount: 0, unmetReason: `Add ${missing} more item${missing === 1 ? '' : 's'}${fromScope} to unlock this deal.` };
  }
  if (promo.minOrderAmount && cartSubtotal < promo.minOrderAmount) {
    return { discount: 0, unmetReason: `Add ${money(promo.minOrderAmount - cartSubtotal)} more to unlock this deal.` };
  }
  if (eligibleSubtotal <= 0) {
    return {
      discount: 0,
      unmetReason: categoryIds ? `Add an item${fromScope} to use this deal.` : 'Add items to your cart to use this deal.',
    };
  }

  let discount =
    promo.amountOff != null
      ? Math.min(promo.amountOff, eligibleSubtotal)
      : eligibleSubtotal * ((promo.discountPercent ?? 0) / 100);
  if (promo.maxDiscountAmount != null) discount = Math.min(discount, promo.maxDiscountAmount);
  // Never more than the order itself -- $7 off a $5 cart is $5 off, not -$2.
  discount = Math.min(discount, cartSubtotal);
  return { discount: Math.round(discount * 100) / 100, unmetReason: null };
}

// Short requirement tags for a deal card ("Pickup only", "Min. $20.00",
// "Buy 2+"), straight off the promotions row.
export function describePromoRequirements(row: any): string[] {
  const tags: string[] = [];
  if (row.order_type === 'pickup') tags.push('Pickup only');
  if (row.order_type === 'delivery') tags.push('Delivery only');
  if (row.min_order_amount != null) tags.push(`Min. ${money(Number(row.min_order_amount))}`);
  if (row.min_item_count != null) tags.push(`Buy ${row.min_item_count}+`);
  return tags;
}
