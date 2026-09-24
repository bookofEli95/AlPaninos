import { useCartStore } from '../store/cartStore';

// Room for the floating "View Cart" bar ((main)/_layout.tsx), which sits
// over every screen except the cart and item screens while the cart has
// something in it. Add it to a scrolling screen's bottom padding so the
// bar never covers the last thing on the page (e.g. Sign Out).
export const CART_BAR_SPACE = 96;

export function useCartBarSpace(): number {
  return useCartStore((state) => state.items.length > 0) ? CART_BAR_SPACE : 0;
}
