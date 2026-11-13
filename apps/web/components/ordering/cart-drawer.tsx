"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Car, Plus, ShoppingBag, Store, Tag, X } from "lucide-react";
import CartLines from "./cart-lines";
import FoodPhoto from "@/components/food-photo";
import { useModal } from "./use-modal";
import { useOrdering } from "./ordering-provider";
import { browserSupabase, useSession } from "@/lib/browser-supabase";
import { cart, cartTotals, useCart } from "@/lib/cart";
import { isQuickAdd, quickAddLine } from "@/lib/ordering/quick-add";
import { money } from "@/lib/format";

type Suggestion = { id: string; name: string; base_price: number; image_url: string | null; category: { id: string; name: string } };

// Sides and drinks from this store that aren't in the order yet -- "Make
// it a meal" under the order.
function useSuggestions(storeId: string | null, inOrder: string[], enabled: boolean) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const key = inOrder.join(",");
  useEffect(() => {
    if (!storeId || !enabled) return;
    let cancelled = false;
    (async () => {
      const supabase = browserSupabase();
      const { data: cats } = await supabase.from("menu_categories").select("id, name").eq("location_id", storeId).in("name", ["Sides", "Drinks"]);
      if (!cats?.length) return;
      const { data } = await supabase
        .from("menu_items")
        .select("id, name, base_price, image_url, category_id")
        .in("category_id", cats.map((c) => c.id))
        .eq("is_available", true)
        .order("base_price", { ascending: false });
      if (cancelled || !data) return;
      const skip = new Set(key.split(","));
      // Taking turns -- a side, a drink, a side -- the ones with photos first.
      const byCategory = cats.map((cat) =>
        data
          .filter((i) => i.category_id === cat.id && !skip.has(i.id))
          .sort((a, b) => Number(!!b.image_url) - Number(!!a.image_url))
      );
      const sides = cats.findIndex((cat) => cat.name === "Sides");
      if (sides > 0) byCategory.unshift(...byCategory.splice(sides, 1));
      const picked: Suggestion[] = [];
      for (let i = 0; picked.length < 3 && byCategory.some((list) => list.length > i); i++) {
        byCategory.forEach((list) => {
          const s = list[i];
          const category = s && cats.find((cat) => cat.id === s.category_id);
          if (s && category && picked.length < 3) picked.push({ ...s, category });
        });
      }
      setItems(picked);
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId, key, enabled]);
  return items;
}

export default function CartDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useModal(open, onClose);
  const c = useCart();
  const { openItem } = useOrdering();
  const { isMember } = useSession();
  const totals = cartTotals(c);
  const suggestions = useSuggestions(c.storeId, c.lines.map((l) => l.menuItemId), open && c.lines.length > 0 && !totals.isCatering);

  return (
    <div className={`fixed inset-0 z-[55] ${open ? "" : "pointer-events-none"}`} aria-hidden={!open} inert={!open}>
      <div className={`absolute inset-0 bg-ink/50 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`} onClick={onClose} />
      <aside
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Your order"
        className={`absolute inset-y-0 right-0 flex w-full max-w-[440px] flex-col bg-white shadow-2xl outline-none transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between gap-4 bg-ink px-5 py-4 text-white">
          <div>
            <h2 className="font-display text-xl font-extrabold">Your Order</h2>
            {c.storeName && (
              <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-stone-400">
                {c.mode === "delivery" ? <Car className="size-3.5" aria-hidden /> : <Store className="size-3.5" aria-hidden />}
                {c.mode === "delivery" ? "Delivery" : "Pickup"} · {c.storeName}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="-mr-1 rounded-md p-1.5 text-stone-300 hover:bg-white/10 hover:text-white" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>

        {c.lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
            <span className="flex size-16 items-center justify-center rounded-full bg-cream-deep">
              <ShoppingBag className="size-7 text-brand" aria-hidden />
            </span>
            <p className="mt-5 font-display text-xl font-extrabold text-ink">Your order is empty</p>
            <p className="mt-1.5 text-[15px] text-stone-500">Pressed hot and stacked high. Something&apos;s calling your name.</p>
            <Link
              href={c.storeId ? `/menu?store=${c.storeId}&mode=${c.mode}` : "/menu"}
              onClick={onClose}
              className="mt-6 rounded-lg bg-brand px-6 py-3.5 text-[14px] font-extrabold uppercase tracking-wide text-white hover:bg-brand-dark"
            >
              Browse the Menu
            </Link>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-5">
              <CartLines lines={c.lines} onEdit={(line) => openItem(line.menuItemId, line.lineId)} />

              {suggestions.length > 0 && (
                <section className="border-t border-stone-200 py-5">
                  <h3 className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-stone-500">Make it a meal</h3>
                  <ul className="mt-3 grid grid-cols-3 gap-2.5">
                    {suggestions.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          // A drink goes straight in (nothing to choose); a side opens to pick its options.
                          onClick={() => (isQuickAdd(s.category.name) && c.storeId ? cart.add(quickAddLine(s, s.category), { id: c.storeId, name: c.storeName ?? "" }) : openItem(s.id))}
                          className="group block w-full text-left"
                        >
                          <span className="relative block">
                            <FoodPhoto src={s.image_url} alt="" sizes="120px" className="aspect-square w-full rounded-lg" />
                            <span className="absolute bottom-1.5 right-1.5 flex size-7 items-center justify-center rounded-full bg-brand text-white shadow-md transition-transform group-hover:scale-110">
                              <Plus className="size-4" aria-hidden />
                            </span>
                          </span>
                          <span className="mt-1.5 line-clamp-2 block text-[13px] font-bold leading-4 text-ink">{s.name}</span>
                          <span className="text-[12px] font-semibold text-stone-500">{money(s.base_price)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>

            <div className="border-t border-stone-200 bg-cream/60 px-5 py-4">
              {c.promo && (
                <div className={`mb-3 flex items-start gap-2 rounded-lg px-3 py-2 text-[13px] ${totals.discount > 0 ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
                  <Tag className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <span>
                    <strong>{c.promo.title}</strong>
                    {totals.discount > 0 ? ` saves you ${money(totals.discount)}` : totals.unmetReason ? `: ${totals.unmetReason}` : ""}
                  </span>
                </div>
              )}
              <dl className="space-y-1 text-[15px]">
                <div className="flex justify-between">
                  <dt className="text-stone-600">Subtotal</dt>
                  <dd className="font-semibold tabular-nums text-ink">{money(totals.subtotal)}</dd>
                </div>
                {totals.discount > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <dt>Deal</dt>
                    <dd className="font-semibold tabular-nums">−{money(totals.discount)}</dd>
                  </div>
                )}
              </dl>
              <Link
                href="/checkout"
                onClick={onClose}
                className="group mt-3.5 flex w-full items-center justify-between rounded-lg bg-brand px-5 py-4 text-white transition-colors hover:bg-brand-dark"
              >
                <span className="text-[15px] font-extrabold uppercase tracking-wide">Checkout</span>
                <span className="flex items-center gap-2 text-[15px] font-extrabold tabular-nums">
                  {money(totals.discounted)}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Link>
              <p className="mt-2 text-center text-[12px] text-stone-500">
                Tax is added at checkout. {isMember ? "This order earns" : "Earn"} {Math.floor(totals.subtotal * 10).toLocaleString("en-CA")} PaninoPoints{isMember ? "." : " with a free account."}
              </p>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
