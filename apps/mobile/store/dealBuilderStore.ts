import { create } from 'zustand';
import type { CartItem } from './cartStore';

// A "buy 2 or more" deal (Mix & Match) being put together on the Deals tab
// (components/DealBuilderSheet.tsx): one slot per meal. A meal is picked on
// the deal's own menu (app/(main)/deal-pick.tsx), set up on the item screen
// ("Confirm Meal 2"), and kept here -- not in the cart -- until the whole
// deal is confirmed, when every meal goes into the cart at once with the
// deal applied. Nothing is saved: closing the app drops a half-built deal.

export type DealMeal = { item: CartItem; locationId: string };

interface DealBuilderState {
  promo: any | null;
  meals: (DealMeal | null)[];
  // The builder sheet is up (it hides while a meal is being picked).
  open: boolean;
  start: (promo: any) => void;
  setMeal: (slot: number, meal: DealMeal) => void;
  clearMeal: (slot: number) => void;
  addSlot: () => void;
  removeSlot: (slot: number) => void;
  setOpen: (open: boolean) => void;
  reset: () => void;
}

// How many meals the deal needs (at least 2 -- that's what makes it a bundle).
export const requiredMeals = (promo: any) => Math.max(2, Number(promo?.min_item_count) || 2);

// A deal is built meal by meal when it needs several qualifying items from
// its categories (e.g. "any 2 or more Mob sandwiches or wraps").
export function isBundleDeal(promo: any): boolean {
  const scoped = !!(promo?.category_name || promo?.category_id || promo?.category_names?.length);
  return scoped && Number(promo?.min_item_count) >= 2;
}

export const useDealBuilderStore = create<DealBuilderState>((set, get) => ({
  promo: null,
  meals: [],
  open: false,
  start: (promo) => {
    // Picking the same deal back up keeps the meals already chosen.
    if (get().promo?.id === promo.id) {
      set({ open: true });
      return;
    }
    set({ promo, meals: Array(requiredMeals(promo)).fill(null), open: true });
  },
  setMeal: (slot, meal) =>
    set((state) => {
      const meals = [...state.meals];
      while (meals.length <= slot) meals.push(null);
      meals[slot] = meal;
      return { meals };
    }),
  clearMeal: (slot) =>
    set((state) => {
      const meals = [...state.meals];
      meals[slot] = null;
      return { meals };
    }),
  addSlot: () => set((state) => ({ meals: [...state.meals, null] })),
  // Only an extra meal (past the deal's minimum) can be taken away.
  removeSlot: (slot) =>
    set((state) => {
      if (!state.promo || state.meals.length <= requiredMeals(state.promo)) return {};
      return { meals: state.meals.filter((_, i) => i !== slot) };
    }),
  setOpen: (open) => set({ open }),
  reset: () => set({ promo: null, meals: [], open: false }),
}));
