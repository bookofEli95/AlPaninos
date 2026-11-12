"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ShoppingBag, Store, UserRound } from "lucide-react";
import { useOrdering } from "./ordering/ordering-provider";
import { cartTotals, useCart } from "@/lib/cart";
import { useSession } from "@/lib/browser-supabase";
import { money } from "@/lib/format";

// The header's live parts: which store the order is from, the order
// button (count and total), and the account link.

export function HeaderStore() {
  const c = useCart();
  return (
    <Link
      href={c.storeId ? `/menu?store=${c.storeId}&mode=${c.mode}` : "/#locations"}
      className="hidden items-center gap-2.5 rounded-lg border border-stone-300 py-1.5 pl-3 pr-2.5 transition-colors hover:border-ink xl:flex"
    >
      <Store className="size-4 text-brand" aria-hidden />
      <span className="text-left leading-tight">
        <span className="block text-[11px] font-bold uppercase tracking-wide text-stone-500">
          {c.storeId ? (c.mode === "delivery" ? "Delivery from" : "Pickup from") : "Ordering from"}
        </span>
        <span className="block max-w-[11rem] truncate text-sm font-bold text-ink">{c.storeName || "Choose a store"}</span>
      </span>
      <ChevronDown className="size-4 text-stone-500" aria-hidden />
    </Link>
  );
}

// Order Now: the menu, at the store and pickup/delivery already chosen --
// and on the menu page itself, down to the food (instead of reloading the
// page it's on, which looked like nothing happened).
export function HeaderOrderNow({ className }: { className: string }) {
  const c = useCart();
  const pathname = usePathname();
  return (
    <Link
      href={c.storeId ? `/menu?store=${c.storeId}&mode=${c.mode}` : "/menu"}
      className={className}
      onClick={(e) => {
        if (pathname !== "/menu") return;
        const items = document.getElementById("menu-items");
        if (!items) return;
        e.preventDefault();
        items.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      }}
    >
      Order Now
    </Link>
  );
}

export function HeaderCart() {
  const c = useCart();
  const { openCart } = useOrdering();
  const { itemCount, discounted } = cartTotals(c);
  return (
    <button
      type="button"
      onClick={openCart}
      className="relative flex h-11 items-center gap-2 rounded-lg border border-stone-300 px-3 text-ink transition-colors hover:border-ink"
      aria-label={`Your order, ${itemCount} ${itemCount === 1 ? "item" : "items"}`}
    >
      <ShoppingBag className="size-5" aria-hidden />
      {itemCount > 0 && <span className="hidden text-[14px] font-extrabold tabular-nums sm:inline">{money(discounted)}</span>}
      {itemCount > 0 && (
        <span key={itemCount} className="absolute -right-2 -top-2 flex min-w-5 animate-[pop_0.35s_ease-out] items-center justify-center rounded-full bg-brand px-1.5 py-0.5 text-[11px] font-extrabold text-white ring-2 ring-white">
          {itemCount}
        </span>
      )}
    </button>
  );
}

export function HeaderAccount({ variant = "bar" }: { variant?: "bar" | "strip" }) {
  const { ready, isMember, user } = useSession();
  const name = user?.user_metadata?.first_name as string | undefined;
  if (variant === "strip") {
    if (ready && isMember) {
      return (
        <Link href="/account" className="font-semibold text-white hover:text-gold">
          {name ? `Hi, ${name}` : "My Account"}
        </Link>
      );
    }
    return (
      <>
        <Link href="/signin" className="font-semibold text-white hover:text-gold">
          Sign In
        </Link>
        <Link href="/join" className="font-semibold text-gold hover:text-white">
          Join PaninoPoints
        </Link>
      </>
    );
  }
  return (
    <Link
      href={ready && isMember ? "/account" : "/signin"}
      className="hidden size-11 items-center justify-center rounded-lg border border-stone-300 text-ink transition-colors hover:border-ink sm:flex lg:hidden"
      aria-label={ready && isMember ? "Your account" : "Sign in"}
    >
      <UserRound className="size-5" aria-hidden />
    </Link>
  );
}
