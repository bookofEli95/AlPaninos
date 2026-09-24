import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useCartStore } from '../store/cartStore';
import { usePromoStore } from '../store/promoStore';
import { useLocationDetails } from './useLocationDetails';
import { evaluatePromo, hasCategoryScope, resolvePromoCategoryIds } from '../lib/promoEligibility';

export type MenuItemInfoMap = Record<string, { categoryId: string; name: string }>;

export const menuItemInfoKey = (locationId: string | null) => ['menuItemInfo', locationId] as const;

// Each item's category and name at a store -- what a category-scoped promo
// ("25% off The Mob") needs to price the cart.
export async function fetchMenuItemInfo(locationId: string): Promise<MenuItemInfoMap> {
  const { data, error } = await supabase.from('menu_items').select('id, category_id, name').eq('location_id', locationId);
  if (error) throw error;
  return Object.fromEntries((data || []).map((m: any) => [m.id, { categoryId: m.category_id, name: m.name }]));
}

// The cart's money, worked out once for everywhere that shows it -- the
// Cart screen and the floating "View Cart" bar ((main)/_layout.tsx) -- so
// the two can never disagree: subtotal, the applied promo's discount (re-
// checked live against its rules), tax on what's left, and the total.
export function useCartTotals() {
  const items = useCartStore((state) => state.items);
  const locationId = useCartStore((state) => state.locationId);
  const orderType = useCartStore((state) => state.orderType);
  const { appliedPromo, setAppliedPromo } = usePromoStore();
  const scoped = !!appliedPromo && hasCategoryScope(appliedPromo);

  const { data: menuItemInfoMap } = useQuery({
    queryKey: menuItemInfoKey(locationId),
    queryFn: () => fetchMenuItemInfo(locationId!),
    enabled: scoped && !!locationId,
    staleTime: 5 * 60000,
  });

  // A category-scoped promo (applied in the cart or from Deals) has to be
  // resolved against this cart's store -- categories are duplicated per
  // store -- and again if the cart moves to another store.
  useEffect(() => {
    if (!appliedPromo || !locationId || !hasCategoryScope(appliedPromo)) return;
    if (appliedPromo.resolvedForLocationId === locationId) return;
    let cancelled = false;
    resolvePromoCategoryIds(appliedPromo, locationId).then((ids) => {
      if (cancelled) return;
      // Re-read: the promo may have changed while this was loading.
      const current = usePromoStore.getState().appliedPromo;
      if (current?.code !== appliedPromo.code) return;
      setAppliedPromo({ ...current, resolvedCategoryIds: ids, resolvedForLocationId: locationId });
    });
    return () => {
      cancelled = true;
    };
  }, [appliedPromo?.code, appliedPromo?.resolvedForLocationId, locationId]);

  // Still working out which categories the promo covers here -- priced at
  // $0 with no "unmet" message rather than briefly flashing a wrong one.
  const promoPending = scoped && (appliedPromo!.resolvedForLocationId !== locationId || !menuItemInfoMap);

  // Live, Domino's-style: every rule (minimum order, buy-2, pickup-only) is
  // re-checked on every cart/order-type change.
  const promoEvaluation = useMemo(() => {
    if (!appliedPromo || promoPending) return { discount: 0, unmetReason: null as string | null };
    return evaluatePromo(
      items,
      appliedPromo,
      scoped ? appliedPromo.resolvedCategoryIds ?? [] : null,
      menuItemInfoMap ?? {},
      orderType
    );
  }, [items, appliedPromo, promoPending, scoped, menuItemInfoMap, orderType]);

  const { data: locationDetails } = useLocationDetails(locationId);
  const taxRate = locationDetails?.taxRate ?? 0.13;

  const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
  const discount = promoEvaluation.discount;
  const discountedSubtotal = Math.max(0, subtotal - discount);
  const tax = discountedSubtotal * taxRate;

  return {
    subtotal,
    discount,
    discountedSubtotal,
    tax,
    total: discountedSubtotal + tax,
    taxRate,
    promoPending,
    unmetReason: promoEvaluation.unmetReason,
  };
}
