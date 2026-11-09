"use client";

import { useSyncExternalStore } from "react";
import { evaluatePromo, type AppliedPromo } from "./ordering/promo";

// The order being built, kept in this browser (so a refresh, or coming back
// later, doesn't lose it) and shared by every part of the site: the menu,
// the order panel, the cart drawer and checkout.

export type CartOption = { optionId: string; name: string; price: number };

export type CartLine = {
  lineId: string;
  menuItemId: string;
  name: string;
  categoryId: string;
  categoryName: string;
  imageUrl: string | null;
  isCatering: boolean;
  // One entry per unit picked, so "2x Fat Tony" is two entries -- saved as
  // two order_item_modifiers rows, the way the app does it.
  options: CartOption[];
  // Base price plus every option, for one.
  unitPrice: number;
  quantity: number;
  specialInstructions?: string;
  // A free reward item (points, the welcome spin, a birthday treat): the
  // customer's own prize code, $0, one per code -- place_order() checks it.
  rewardCode?: string;
  rewardTitle?: string;
  // A catering package priced per person: the quantity is the number of
  // people.
  perPerson?: boolean;
};

export type CartState = {
  storeId: string | null;
  storeName: string | null;
  mode: "pickup" | "delivery";
  address: string;
  lines: CartLine[];
  promo: AppliedPromo | null;
};

const EMPTY: CartState = { storeId: null, storeName: null, mode: "pickup", address: "", lines: [], promo: null };

// Most of one line: 99 of a menu item, or 1,000 people for a per-person
// catering package (the same limits as place_order()).
export const maxQuantity = (line: { perPerson?: boolean }) => (line.perPerson ? 1000 : 99);

const newId = () => Math.random().toString(36).slice(2, 10);

// One order kept in this browser under `key`, with its actions.
function createCartStore(key: string) {
  let state: CartState = EMPTY;
  let loaded = false;
  const listeners = new Set<() => void>();

  function load() {
    if (loaded || typeof window === "undefined") return;
    loaded = true;
    try {
      const saved = window.localStorage.getItem(key);
      if (saved) state = { ...EMPTY, ...JSON.parse(saved) };
    } catch {
      // Private browsing or blocked storage: the order just isn't remembered.
    }
    // Another tab changed the order.
    window.addEventListener("storage", (e) => {
      if (e.key !== key) return;
      try {
        state = e.newValue ? { ...EMPTY, ...JSON.parse(e.newValue) } : EMPTY;
      } catch {
        state = EMPTY;
      }
      listeners.forEach((l) => l());
    });
  }

  function set(next: Partial<CartState>) {
    load();
    const hadLines = state.lines.length > 0;
    state = { ...state, ...next };
    // An order that's just been emptied is a fresh start: the deal comes off
    // too (as in the app). A deal applied before anything's added stays.
    if (hadLines && state.lines.length === 0) state = { ...state, promo: null };
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch {}
    listeners.forEach((l) => l());
  }

  function get(): CartState {
    load();
    return state;
  }

  function useOrder(): CartState {
    return useSyncExternalStore(
      (listener) => {
        load();
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      () => (load(), state),
      () => EMPTY
    );
  }

  const actions = {
    // The store being ordered from. A different store than the order's items
    // are from empties the order -- callers ask the customer first.
    setStore(storeId: string, storeName: string) {
      const current = get();
      if (current.storeId === storeId) {
        if (current.storeName !== storeName) set({ storeName });
        return;
      }
      set({ storeId, storeName, lines: current.storeId ? [] : current.lines });
    },
    setMode(mode: "pickup" | "delivery") {
      set({ mode });
    },
    setAddress(address: string) {
      set({ address });
    },
    // Adds a line; the same item with the same options and notes just adds
    // to that line's quantity.
    add(line: Omit<CartLine, "lineId">, store: { id: string; name: string }): string {
      const current = get();
      const lines = current.storeId && current.storeId !== store.id ? [] : current.lines;
      const signature = (l: Omit<CartLine, "lineId">) =>
        JSON.stringify([l.menuItemId, l.options.map((o) => o.optionId).sort(), l.specialInstructions ?? "", l.rewardCode ?? ""]);
      const match = line.rewardCode ? undefined : lines.find((l) => signature(l) === signature(line));
      // One line per reward code.
      const kept = line.rewardCode ? lines.filter((l) => l.rewardCode !== line.rewardCode) : lines;
      const lineId = match?.lineId ?? newId();
      set({
        storeId: store.id,
        storeName: store.name,
        lines: match
          ? lines.map((l) => (l.lineId === match.lineId ? { ...l, quantity: Math.min(maxQuantity(l), l.quantity + line.quantity) } : l))
          : [...kept, { ...line, lineId }],
      });
      return lineId;
    },
    // Always a line of its own (a second Pasta Alla Al with another sauce).
    append(line: Omit<CartLine, "lineId">, store: { id: string; name: string }): string {
      const current = get();
      const lines = current.storeId && current.storeId !== store.id ? [] : current.lines;
      const lineId = newId();
      set({ storeId: store.id, storeName: store.name, lines: [...lines, { ...line, lineId }] });
      return lineId;
    },
    replace(lineId: string, line: Omit<CartLine, "lineId">) {
      set({ lines: get().lines.map((l) => (l.lineId === lineId ? { ...line, lineId } : l)) });
    },
    setQuantity(lineId: string, quantity: number) {
      const lines = get().lines;
      set({
        lines: quantity <= 0 ? lines.filter((l) => l.lineId !== lineId) : lines.map((l) => (l.lineId === lineId ? { ...l, quantity: Math.min(maxQuantity(l), quantity) } : l)),
      });
    },
    remove(lineId: string) {
      set({ lines: get().lines.filter((l) => l.lineId !== lineId) });
    },
    clear() {
      set({ lines: [] });
    },
    setPromo(promo: AppliedPromo | null) {
      set({ promo });
    },
    // Everything at once (the catering form moving its packages to another
    // store).
    reset(next: Partial<CartState>) {
      set(next);
    },
  };

  return { get, useOrder, cart: actions };
}

export type CartStore = ReturnType<typeof createCartStore>;

// The everyday order: the menu, the cart drawer and checkout.
export const mainCart = createCartStore("alpaninos-cart-v1");
export const cart = mainCart.cart;
export const getCart = mainCart.get;
export function useCart(): CartState {
  return mainCart.useOrder();
}

// The catering form's order, kept apart so lunch in the cart and a
// catering spread for next week never end up in one order.
export const cateringCart = createCartStore("alpaninos-catering-v1");

// False on the server and during hydration, then true -- for pages that
// show the order, so they don't flash "empty" before it's read.
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

// Cents, rounded half up like the database's round(x, 2) -- the toFixed
// keeps 3.315 (stored as 3.31499...) from rounding down.
export const round2 = (x: number) => Math.round(Number((x * 100).toFixed(4))) / 100;

// The order's money, worked out the same way everywhere it's shown.
export function cartTotals(c: CartState, taxRate = 0.13) {
  const subtotal = c.lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const itemCount = c.lines.reduce((sum, l) => sum + l.quantity, 0);
  // Free reward items don't count toward a deal ("buy 2" isn't a free one
  // and a paid one).
  const paid = c.lines.filter((l) => !l.rewardCode);
  const promo = c.promo ? evaluatePromo(paid, c.promo, c.mode, c.storeId) : { discount: 0, unmetReason: null };
  const discounted = round2(Math.max(0, subtotal - promo.discount));
  const tax = round2(discounted * taxRate);
  return {
    subtotal,
    itemCount,
    discount: promo.discount,
    unmetReason: promo.unmetReason,
    discounted,
    tax,
    total: round2(discounted + tax),
    isCatering: c.lines.some((l) => l.isCatering),
  };
}
