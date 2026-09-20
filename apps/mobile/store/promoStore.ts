import { create } from 'zustand';

export type AppliedPromo = {
  code: string;
  title: string;
  discountPercent: number;
  categoryId: string | null;
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
