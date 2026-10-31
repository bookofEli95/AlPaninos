"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { CheckCircle2, ShoppingBag, X } from "lucide-react";
import ItemDialog from "./item-dialog";
import CartDrawer from "./cart-drawer";
import { cartTotals, useCart } from "@/lib/cart";
import { money } from "@/lib/format";

export type Reward = { code: string; title: string };

type Toast = { id: number; message: string; action?: { label: string; onClick: () => void } };

type Ordering = {
  // The item builder for one menu item -- or for a line already in the
  // order, to change it.
  openItem: (itemId: string, editLineId?: string, reward?: Reward) => void;
  openCart: () => void;
  notify: (message: string, action?: Toast["action"]) => void;
};

const OrderingContext = createContext<Ordering | null>(null);

export function useOrdering(): Ordering {
  const value = useContext(OrderingContext);
  if (!value) throw new Error("useOrdering must be used inside <OrderingProvider>");
  return value;
}

// Wraps the whole site: the item builder, the cart drawer and the little
// "Added to your order" notes live here, so any page can open them.
export default function OrderingProvider({ children }: { children: React.ReactNode }) {
  const [item, setItem] = useState<{ itemId: string; editLineId?: string; reward?: Reward } | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((message: string, action?: Toast["action"]) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ id: Date.now(), message, action });
    timer.current = setTimeout(() => setToast(null), 4500);
  }, []);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const value = useMemo<Ordering>(
    () => ({
      openItem: (itemId, editLineId, reward) => {
        setCartOpen(false);
        setItem({ itemId, editLineId, reward });
      },
      openCart: () => setCartOpen(true),
      notify,
    }),
    [notify]
  );

  return (
    <OrderingContext.Provider value={value}>
      {children}
      {item && (
        <ItemDialog key={`${item.itemId}-${item.editLineId ?? ""}`} itemId={item.itemId} editLineId={item.editLineId} reward={item.reward} onClose={() => setItem(null)} />
      )}
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
      <MobileOrderBar onOpen={() => setCartOpen(true)} />
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex justify-center px-4 sm:bottom-6">
        {toast && (
          <div
            key={toast.id}
            className="pointer-events-auto flex w-full max-w-md animate-[toast-in_0.25s_ease-out] items-center gap-3 rounded-xl bg-ink px-4 py-3 text-white shadow-2xl shadow-black/30"
          >
            <CheckCircle2 className="size-5 shrink-0 text-gold" aria-hidden />
            <p className="flex-1 text-[14px] font-semibold">{toast.message}</p>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action!.onClick();
                  setToast(null);
                }}
                className="rounded-md bg-white/10 px-3 py-1.5 text-[13px] font-extrabold uppercase tracking-wide text-gold hover:bg-white/20"
              >
                {toast.action.label}
              </button>
            )}
            <button type="button" onClick={() => setToast(null)} className="rounded-md p-1 text-stone-400 hover:text-white" aria-label="Dismiss">
              <X className="size-4" />
            </button>
          </div>
        )}
      </div>
    </OrderingContext.Provider>
  );
}

// Phones and tablets: "View Order" along the bottom while there's an order,
// like the app's cart bar -- not on checkout or an order's page.
function MobileOrderBar({ onOpen }: { onOpen: () => void }) {
  const c = useCart();
  const pathname = usePathname();
  const { itemCount, discounted } = cartTotals(c);
  if (!itemCount || pathname.startsWith("/checkout") || pathname.startsWith("/order/")) return null;
  return (
    <>
      <div className="h-20 lg:hidden" aria-hidden />
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-stone-200 bg-white/95 p-3 backdrop-blur-md lg:hidden">
        <button type="button" onClick={onOpen} className="flex w-full items-center justify-between rounded-lg bg-brand px-4 py-3.5 text-white shadow-lg shadow-brand/25">
          <span className="flex items-center gap-2.5 text-[15px] font-extrabold uppercase tracking-wide">
            <span className="relative">
              <ShoppingBag className="size-5" aria-hidden />
              <span key={itemCount} className="absolute -right-2 -top-2 flex min-w-4 animate-[pop_0.35s_ease-out] items-center justify-center rounded-full bg-gold px-1 text-[10px] font-extrabold text-ink">
                {itemCount}
              </span>
            </span>
            View Order
          </span>
          <span className="text-[15px] font-extrabold tabular-nums">{money(discounted)}</span>
        </button>
      </div>
    </>
  );
}
