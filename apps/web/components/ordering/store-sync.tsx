"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { cart, getCart } from "@/lib/cart";

// Keeps the menu page and the order on the same store: a menu opened
// without a store shows the order's; otherwise an empty order (or one
// not started yet) takes on the store and pickup/delivery being browsed.
export default function StoreSync({
  storeId,
  storeName,
  mode,
  explicitStore,
  explicitMode,
  address,
}: {
  storeId: string;
  storeName: string;
  mode: "pickup" | "delivery";
  explicitStore: boolean;
  explicitMode: boolean;
  address?: string;
}) {
  const router = useRouter();
  useEffect(() => {
    const c = getCart();
    if (!explicitStore && c.storeId && c.storeId !== storeId) {
      router.replace(`/menu?store=${c.storeId}&mode=${explicitMode ? mode : c.mode}`);
      return;
    }
    if (!c.storeId || c.lines.length === 0 || c.storeId === storeId) cart.setStore(storeId, storeName);
    if (explicitMode) cart.setMode(mode);
    else if (c.mode !== mode && c.storeId === storeId) router.replace(`/menu?store=${storeId}&mode=${c.mode}`);
    if (address && address !== c.address) cart.setAddress(address);
  }, [storeId, storeName, mode, explicitStore, explicitMode, address, router]);
  return null;
}
