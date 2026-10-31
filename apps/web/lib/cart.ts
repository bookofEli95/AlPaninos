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
};

export type CartState = {
  storeId: string | null;
  storeName: string | null;
  mode: "pickup" | "delivery";
  address: string;
  lines: CartLine[];
  promo: AppliedPromo | null;
};

const KEY = "alpaninos-cart-v1";
const EMPTY: CartState = { storeId: null, storeName: null, mode: "pickup", address: "", lines: [], promo: null };

let state: CartState = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved) state = { ...EMPTY, ...JSON.parse(saved) };
  } catch {
    // Private browsing or blocked storage: the cart just isn't remembered.
  }
  // Another tab changed the order.
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
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
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
  listeners.forEach((l) => l());
}

export function getCart(): CartState {
  load();
  return state;
}

// False on the server and during hydration, then true -- for pages that
// show the order, so they don't flash "empty" before it's read.
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

export function useCart(): CartState {
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

const newId = () => Math.random().toString(36).slice(2, 10);

export const cart = {
  // The store being ordered from. A different store than the order's items
  // are from empties the order -- callers ask the customer first.
  setStore(storeId: string, storeName: string) {
    const current = getCart();
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
  add(line: Omit<CartLine, "lineId">, store: { id: string; name: string }) {
    const current = getCart();
    const lines = current.storeId && current.storeId !== store.id ? [] : current.lines;
    const signature = (l: Omit<CartLine, "lineId">) =>
      JSON.stringify([l.menuItemId, l.options.map((o) => o.optionId).sort(), l.specialInstructions ?? "", l.rewardCode ?? ""]);
    const match = line.rewardCode ? undefined : lines.find((l) => signature(l) === signature(line));
    // One line per reward code.
    const kept = line.rewardCode ? lines.filter((l) => l.rewardCode !== line.rewardCode) : lines;
    set({
      storeId: store.id,
      storeName: store.name,
      lines: match
        ? lines.map((l) => (l.lineId === match.lineId ? { ...l, quantity: Math.min(99, l.quantity + line.quantity) } : l))
        : [...kept, { ...line, lineId: newId() }],
    });
  },
  replace(lineId: string, line: Omit<CartLine, "lineId">) {
    set({ lines: getCart().lines.map((l) => (l.lineId === lineId ? { ...line, lineId } : l)) });
  },
  setQuantity(lineId: string, quantity: number) {
    const lines = getCart().lines;
    set({
      lines: quantity <= 0 ? lines.filter((l) => l.lineId !== lineId) : lines.map((l) => (l.lineId === lineId ? { ...l, quantity: Math.min(99, quantity) } : l)),
    });
  },
  remove(lineId: string) {
    set({ lines: getCart().lines.filter((l) => l.lineId !== lineId) });
  },
  clear() {
    set({ lines: [] });
  },
  setPromo(promo: AppliedPromo | null) {
    set({ promo });
  },
};

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
