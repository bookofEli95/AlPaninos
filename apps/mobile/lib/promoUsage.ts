// A deal is used up once its code is on one of the customer's orders
// (usedCodes: lower-case codes, from hooks/useUsedPromoCodes) -- unless
// it's marked reusable (promotions.single_use = false).
export function isPromoUsed(promo: { code?: string | null; single_use?: boolean | null }, usedCodes?: Set<string>) {
  return promo.single_use !== false && !!promo.code && !!usedCodes?.has(promo.code.toLowerCase());
}
