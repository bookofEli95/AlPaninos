// Deals in the cart -- the app's lib/promoEligibility.ts rules, which
// place_order() in the database repeats when the order goes in (so the
// total here always matches what's charged).

export type AppliedPromo = {
  code: string;
  title: string;
  discountPercent: number | null;
  amountOff: number | null;
  // Category scope: a fixed category_id, one category_name, or a list of
  // category_names. All empty means the whole order.
  categoryId: string | null;
  categoryNames: string[];
  itemNamePatterns: string[] | null;
  maxDiscountAmount: number | null;
  minOrderAmount: number | null;
  minItemCount: number | null;
  maxDiscountedItems: number | null;
  orderType: "pickup" | "delivery" | null;
  locationId: string | null;
  singleUse: boolean;
};

export type PromoRow = {
  code: string;
  title: string;
  description?: string | null;
  discount_percent: number | string | null;
  amount_off: number | string | null;
  category_id?: string | null;
  category_name?: string | null;
  category_names?: string[] | null;
  item_name_patterns?: string[] | null;
  max_discount_amount?: number | string | null;
  min_order_amount?: number | string | null;
  min_item_count?: number | null;
  max_discounted_items?: number | null;
  order_type?: "pickup" | "delivery" | null;
  location_id?: string | null;
  single_use?: boolean | null;
  expires_at?: string | null;
  user_id?: string | null;
  is_active?: boolean;
};

const num = (v: unknown) => (v != null && v !== "" ? Number(v) : null);

export function appliedPromoFromRow(row: PromoRow): AppliedPromo {
  return {
    code: row.code,
    title: row.title,
    discountPercent: num(row.discount_percent),
    amountOff: num(row.amount_off),
    categoryId: row.category_id ?? null,
    categoryNames: [...(row.category_names ?? []), ...(row.category_name ? [row.category_name] : [])],
    itemNamePatterns: row.item_name_patterns?.length ? row.item_name_patterns : null,
    maxDiscountAmount: num(row.max_discount_amount),
    minOrderAmount: num(row.min_order_amount),
    minItemCount: row.min_item_count != null ? Number(row.min_item_count) : null,
    maxDiscountedItems: row.max_discounted_items != null ? Number(row.max_discounted_items) : null,
    orderType: row.order_type ?? null,
    locationId: row.location_id ?? null,
    singleUse: row.single_use !== false,
  };
}

export type PromoLine = { quantity: number; unitPrice: number; categoryId: string; categoryName: string; name: string };

const money = (n: number) => `$${n.toFixed(2)}`;
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// The discount right now and, when it's $0, what to do about it ("Add $4.50
// more to unlock this deal.") -- re-checked on every change to the order.
export function evaluatePromo(
  lines: PromoLine[],
  promo: AppliedPromo,
  orderType: "pickup" | "delivery",
  storeId: string | null
): { discount: number; unmetReason: string | null } {
  if (promo.locationId && storeId && promo.locationId !== storeId) {
    return { discount: 0, unmetReason: "This deal isn't available at this store." };
  }
  if (promo.orderType && promo.orderType !== orderType) {
    return { discount: 0, unmetReason: `This deal is for ${promo.orderType} orders only. Switch to ${promo.orderType} to use it.` };
  }
  const scoped = !!promo.categoryId || promo.categoryNames.length > 0;
  const eligible = lines.filter((line) => {
    if (scoped && !(line.categoryId === promo.categoryId || promo.categoryNames.some((n) => same(n, line.categoryName)))) return false;
    if (promo.itemNamePatterns && !promo.itemNamePatterns.some((p) => same(p, line.name))) return false;
    return true;
  });
  const eligibleCount = eligible.reduce((sum, l) => sum + l.quantity, 0);
  let eligibleSubtotal = eligible.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  if (promo.maxDiscountedItems != null) {
    const units = eligible.flatMap((l) => Array<number>(l.quantity).fill(l.unitPrice)).sort((a, b) => a - b);
    eligibleSubtotal = units.slice(0, Math.max(0, promo.maxDiscountedItems)).reduce((sum, n) => sum + n, 0);
  }
  const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const fromScope = scoped && promo.categoryNames.length ? ` from ${promo.categoryNames.join(" or ")}` : scoped ? " that qualifies" : "";

  if (promo.minItemCount && eligibleCount < promo.minItemCount) {
    const missing = promo.minItemCount - eligibleCount;
    return { discount: 0, unmetReason: `Add ${missing} more item${missing === 1 ? "" : "s"}${fromScope} to unlock this deal.` };
  }
  if (promo.minOrderAmount && subtotal < promo.minOrderAmount) {
    return { discount: 0, unmetReason: `Add ${money(promo.minOrderAmount - subtotal)} more to unlock this deal.` };
  }
  if (eligibleSubtotal <= 0) {
    return { discount: 0, unmetReason: scoped ? `Add an item${fromScope} to use this deal.` : "Add items to your order to use this deal." };
  }
  let discount = promo.amountOff != null ? Math.min(promo.amountOff, eligibleSubtotal) : eligibleSubtotal * ((promo.discountPercent ?? 0) / 100);
  if (promo.maxDiscountAmount != null) discount = Math.min(discount, promo.maxDiscountAmount);
  discount = Math.min(discount, subtotal);
  return { discount: Math.round(Number((discount * 100).toFixed(4))) / 100, unmetReason: null };
}

// "25% OFF", "$3 OFF".
export function promoValue(p: { discountPercent: number | null; amountOff: number | null }): string {
  if (p.discountPercent) return `${Number(p.discountPercent)}% OFF`;
  if (p.amountOff) return `$${Number(p.amountOff) % 1 ? Number(p.amountOff).toFixed(2) : Number(p.amountOff)} OFF`;
  return "DEAL";
}
