import { create } from 'zustand';

// Everything evaluatePromo() (lib/promoEligibility.ts) needs to price a
// promo against the current cart -- built from a promotions row by
// appliedPromoFromRow, never by hand, so every screen reads the same rules.
export type AppliedPromo = {
  code: string;
  title: string;
  // Exactly one of these is set (see the promo_rules migration's check).
  discountPercent: number | null;
  amountOff: number | null;
  // Category scope, as stored on the promotion: a fixed category_id
  // (staff-authored), a single category_name (wheel/points prizes), or a
  // category_names list (Mix & Match deals). All null = whole cart.
  categoryId: string | null;
  categoryName: string | null;
  categoryNames: string[] | null;
  itemNamePatterns: string[] | null;
  maxDiscountAmount: number | null;
  minOrderAmount: number | null;
  minItemCount: number | null;
  orderType: 'pickup' | 'delivery' | null;
  // The category scope above, resolved to concrete ids for one location
  // (categories are duplicated per location) -- see the cart's resolver
  // effect. Re-resolved whenever the cart's location changes.
  resolvedCategoryIds?: string[] | null;
  resolvedForLocationId?: string | null;
};

interface PromoState {
  appliedPromo: AppliedPromo | null;
  setAppliedPromo: (promo: AppliedPromo | null) => void;
}

// Shared (not persisted -- matches cartStore, reset on app restart) so a
// promo tapped on the Deals screen shows up applied in the Cart, and vice
// versa, instead of each screen keeping its own disconnected copy.
export const usePromoStore = create<PromoState>((set) => ({
  appliedPromo: null,
  setAppliedPromo: (promo) => set({ appliedPromo: promo }),
}));
