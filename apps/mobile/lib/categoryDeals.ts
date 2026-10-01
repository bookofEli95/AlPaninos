import { isPromoUsed } from './promoUsage';

// The deal to show on a menu category (the Menu's gold tag, the category's
// banner): a store-wide deal on that category -- not a personal prize, not a
// free item -- that this customer can still use. When several cover the
// same category (25% off one Mob sandwich, 20% off 2+ Paninos), the bigger
// saving is shown. Null when there's none left for them.
export function bestCategoryDeal(
  promotions: any[] | null | undefined,
  category: { id: string; name: string },
  usedCodes?: Set<string>
): any | null {
  const name = String(category.name).trim().toLowerCase();
  const matching = (promotions || []).filter((p: any) => {
    if (p.user_id || Number(p.discount_percent) >= 100 || isPromoUsed(p, usedCodes)) return false;
    const names = [...(p.category_names ?? []), p.category_name]
      .filter(Boolean)
      .map((n: string) => n.trim().toLowerCase());
    return p.category_id === category.id || names.includes(name);
  });
  matching.sort(
    (a: any, b: any) =>
      (Number(b.discount_percent) || 0) - (Number(a.discount_percent) || 0) ||
      (Number(b.amount_off) || 0) - (Number(a.amount_off) || 0)
  );
  return matching[0] ?? null;
}

// The short tag for a category's deal, on its tiles: "25% OFF", "$3 OFF",
// or for a buy-2-or-more deal "2+ · 20% OFF" (it only kicks in at two).
export function dealTagLabel(promo: any): string {
  const pct = Number(promo?.discount_percent) || 0;
  const amount = Number(promo?.amount_off) || 0;
  const value =
    pct > 0
      ? `${Number.isInteger(pct) ? pct : pct.toFixed(1)}% OFF`
      : amount > 0
      ? `$${Number.isInteger(amount) ? amount : amount.toFixed(2)} OFF`
      : 'DEAL';
  const min = Number(promo?.min_item_count) || 0;
  return min >= 2 ? `${min}+ · ${value}` : value;
}
