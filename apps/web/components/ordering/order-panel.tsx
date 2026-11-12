"use client";

import Link from "next/link";
import { ArrowRight, ShoppingBag, Tag } from "lucide-react";
import CartLines from "./cart-lines";
import { useOrdering } from "./ordering-provider";
import { cartTotals, useCart } from "@/lib/cart";
import { money } from "@/lib/format";

// "Your Order" alongside the menu on big screens -- live, the same order
// as the cart drawer.
export default function OrderPanel({ storeName, mode }: { storeName: string; mode: "pickup" | "delivery" }) {
  const c = useCart();
  const { openItem } = useOrdering();
  const totals = cartTotals(c);
  const points = Math.floor(totals.subtotal * 10);

  return (
    <div className="sticky top-[calc(var(--header-height)+5rem)] flex max-h-[calc(100dvh-var(--header-height)-6.5rem)] flex-col overflow-hidden rounded-xl bg-white ring-1 ring-stone-200">
      <div className="bg-ink px-5 py-4 text-white">
        <h2 className="font-display text-xl font-extrabold">Your Order</h2>
        <p className="mt-0.5 text-[13px] text-stone-400">
          {(c.lines.length ? c.mode : mode) === "delivery" ? "Delivery" : "Pickup"} · {c.lines.length ? c.storeName : storeName}
        </p>
      </div>
      {c.lines.length === 0 ? (
        <div className="flex flex-col items-center px-5 py-10 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-cream-deep">
            <ShoppingBag className="size-6 text-brand" aria-hidden />
          </span>
          <p className="mt-4 font-bold text-ink">Your order is empty</p>
          <p className="mt-1 text-sm text-stone-500">Pick something tasty from the menu to get started.</p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-5">
          <CartLines lines={c.lines} compact onEdit={(line) => openItem(line.menuItemId, line.lineId)} />
        </div>
      )}
      <div className="border-t border-stone-200 p-5">
        {c.promo && (
          <p className={`mb-3 flex items-start gap-1.5 text-[13px] ${totals.discount > 0 ? "text-emerald-700" : "text-amber-800"}`}>
            <Tag className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {totals.discount > 0 ? `${c.promo.title}: −${money(totals.discount)}` : totals.unmetReason ?? c.promo.title}
          </p>
        )}
        <div className="flex items-center justify-between text-[15px]">
          <span className="font-semibold text-stone-600">Subtotal</span>
          <span className="font-extrabold tabular-nums text-ink">{money(totals.discounted)}</span>
        </div>
        {c.lines.length ? (
          <Link
            href="/checkout"
            className="group mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-brand py-3.5 text-[14px] font-extrabold uppercase tracking-wide text-white transition-colors hover:bg-brand-dark"
          >
            Checkout
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        ) : (
          <span className="mt-4 block w-full rounded-lg bg-stone-200 py-3.5 text-center text-[14px] font-extrabold uppercase tracking-wide text-stone-700">Add items to check out</span>
        )}
        <p className="mt-3 text-center text-xs text-stone-500">{points > 0 ? `This order earns ${points.toLocaleString("en-CA")} PaninoPoints.` : "Earn 10 PaninoPoints for every $1."}</p>
      </div>
    </div>
  );
}
