import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import { Alert } from '../lib/alert';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import { isPromoUsed, useUsedPromoCodes } from '../hooks/useUsedPromoCodes';
import { useAuthStore } from '../store/authStore';
import { useCartStore } from '../store/cartStore';
import { usePromoStore } from '../store/promoStore';
import { appliedPromoFromRow, evaluatePromo, hasCategoryScope } from '../lib/promoEligibility';
import {
  EligiblePrizeItem,
  fetchEligiblePrizeItems,
  isPickAnItemPrize,
  itemHasModifiers,
} from '../lib/prizeRedemption';
import { fetchMenuItemInfo, menuItemInfoKey } from '../hooks/useCartTotals';
import PrizeItemPicker from './PrizeItemPicker';

const money = (n: number) => `$${n.toFixed(2)}`;

type DealRow = {
  promo: any;
  // A pick-a-free-item reward (Free Mob Sandwich...) rather than a discount.
  freeItem: boolean;
  inCart: boolean;
  applied: boolean;
  savings: number;
  // What's missing ("Add $5.50 more to unlock this deal.") -- null when it
  // works on this cart right now.
  unmet: string | null;
};

// "3 deals available · best saves $4.20" under the cart's promo box -- tap to
// see every deal this customer can use at this store (the same list as the
// Deals tab: store-wide deals plus their own wheel / PaninoPoints rewards,
// minus single-use codes they've already used), each priced live against the
// cart, and tap one to apply it. Guests see the store-wide deals.
export default function AvailableDeals({ locationId }: { locationId: string }) {
  const router = useRouter();
  const { session } = useAuthStore();
  const userId = session?.user?.id;
  const items = useCartStore((state) => state.items);
  const orderType = useCartStore((state) => state.orderType);
  const addFreeItem = useCartStore((state) => state.addFreeItem);
  const { appliedPromo, setAppliedPromo } = usePromoStore();
  const [open, setOpen] = useState(false);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ promo: any; items: EligiblePrizeItem[] } | null>(null);

  // Same query (and cache) as the Deals tab.
  const { data: promotions } = useQuery({
    queryKey: ['promotions', locationId, userId, 'all'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('promotions')
        .select('*')
        .eq('is_active', true)
        .or(`location_id.eq.${locationId},location_id.is.null`)
        .or(`user_id.is.null,user_id.eq.${userId}`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!locationId && !!userId,
  });

  const { data: usedCodes } = useUsedPromoCodes();

  // What each deal needs to be priced here: every item's category, and this
  // store's category names (a deal names its categories; ids are per store).
  const { data: menuItemInfoMap } = useQuery({
    queryKey: menuItemInfoKey(locationId),
    queryFn: () => fetchMenuItemInfo(locationId),
    enabled: !!locationId,
    staleTime: 5 * 60000,
  });
  const { data: categories } = useQuery({
    queryKey: ['categoryNames', locationId],
    queryFn: async () => {
      const { data, error } = await supabase.from('menu_categories').select('id, name').eq('location_id', locationId);
      if (error) throw error;
      return (data || []) as { id: string; name: string }[];
    },
    enabled: !!locationId,
    staleTime: 5 * 60000,
  });

  // Same matching as resolvePromoCategoryIds, done in one go for every deal.
  const categoryIdsFor = (promo: any): string[] | null => {
    const applied = appliedPromoFromRow(promo);
    if (!hasCategoryScope(applied)) return null;
    if (applied.categoryId) return [applied.categoryId];
    const wanted = [...(applied.categoryNames ?? []), ...(applied.categoryName ? [applied.categoryName] : [])].map((n) =>
      n.trim().toLowerCase()
    );
    return (categories ?? []).filter((c) => wanted.includes(c.name.trim().toLowerCase())).map((c) => c.id);
  };

  const rows = useMemo<DealRow[]>(() => {
    if (!promotions || !menuItemInfoMap || !categories) return [];
    return promotions
      .filter((p: any) => !!p.code && !isPromoUsed(p, usedCodes))
      .map((p: any): DealRow => {
        if (isPickAnItemPrize(p)) {
          const inCart = items.some((i) => i.promoCode === p.code);
          return { promo: p, freeItem: true, inCart, applied: inCart, savings: 0, unmet: null };
        }
        const { discount, unmetReason } = evaluatePromo(
          items,
          appliedPromoFromRow(p),
          categoryIdsFor(p),
          menuItemInfoMap,
          orderType
        );
        return {
          promo: p,
          freeItem: false,
          inCart: false,
          applied: appliedPromo?.code === p.code,
          savings: discount,
          unmet: discount > 0 ? null : unmetReason,
        };
      })
      // Free-item rewards first, then what saves the most, then what's
      // closest to working.
      .sort((a: DealRow, b: DealRow) => {
        if (a.freeItem !== b.freeItem) return a.freeItem ? -1 : 1;
        return b.savings - a.savings;
      });
  }, [promotions, usedCodes, menuItemInfoMap, categories, items, orderType, appliedPromo?.code]);

  if (rows.length === 0) return null;

  // The discount that saves the most on this cart right now -- one tap
  // applies it without opening the list. (Free-item prizes have no dollar
  // figure until an item is picked, so they're never "best".)
  const bestRow = rows.reduce<DealRow | null>(
    (best, r) => (!r.freeItem && r.savings > 0 && (!best || r.savings > best.savings) ? r : best),
    null
  );
  const showApplyBest = !!bestRow && !bestRow.applied;
  const count = `${rows.length} deal${rows.length === 1 ? '' : 's'} available`;
  const summary = bestRow?.applied ? `${count} · best deal applied` : count;

  const giveFreeItem = async (target: EligiblePrizeItem, promo: any) => {
    if (await itemHasModifiers(target.id)) {
      // Its choices (bread, sauce...) still need picking -- the item screen
      // adds it free with this code.
      router.push({
        pathname: `/(main)/item/${target.id}`,
        params: { promoCode: promo.code, promoTitle: promo.title, returnTo: 'cart' },
      });
      return;
    }
    addFreeItem(
      { menuItemId: target.id, name: target.name, basePrice: target.base_price, imageUrl: target.image_url },
      locationId,
      promo.code
    );
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const handleTap = async (row: DealRow) => {
    const { promo } = row;
    if (busyCode || row.applied) return;
    if (row.freeItem) {
      setBusyCode(promo.code);
      try {
        const eligible = await fetchEligiblePrizeItems(promo, locationId);
        if (eligible.length === 0) Alert.alert('Not Available', "This prize isn't available at this location right now.");
        else if (eligible.length === 1) await giveFreeItem(eligible[0], promo);
        else setPicker({ promo, items: eligible });
      } finally {
        setBusyCode(null);
      }
      return;
    }
    // Resolved here so the promo box shows its real state straight away
    // (same as typing the code in).
    const applied = appliedPromoFromRow(promo);
    if (hasCategoryScope(applied)) {
      applied.resolvedCategoryIds = categoryIdsFor(promo);
      applied.resolvedForLocationId = locationId;
    }
    setAppliedPromo(applied);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setOpen(false);
  };

  return (
    <View className="mt-3 pt-3 border-t border-stone-100">
      <TouchableOpacity onPress={() => setOpen((o) => !o)} className="flex-row items-center justify-between">
        <View className="flex-row items-center flex-1 mr-2">
          <Ionicons name="gift-outline" size={16} color="#A61C14" />
          <Text className="text-sm font-inter-semibold text-stone-700 ml-2 flex-1" numberOfLines={1}>
            {summary}
          </Text>
        </View>
        {showApplyBest && (
          <TouchableOpacity
            onPress={() => handleTap(bestRow!)}
            disabled={!!busyCode}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            className="bg-[#A61C14] rounded-lg px-2.5 py-1.5 mr-2 active:bg-[#85140E]"
          >
            <Text className="text-[#F4ECE1] text-xs font-inter-bold">Apply best · Save {money(bestRow!.savings)}</Text>
          </TouchableOpacity>
        )}
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color="#A8A29E" />
      </TouchableOpacity>

      {open && (
        <View className="mt-2.5 gap-2">
          {rows.map((row) => {
            const { promo } = row;
            const works = row.freeItem || row.savings > 0;
            return (
              <TouchableOpacity
                key={promo.id}
                onPress={() => handleTap(row)}
                disabled={row.applied || !!busyCode}
                activeOpacity={0.8}
                className={`flex-row items-center rounded-xl border px-3 py-2.5 ${
                  row.applied ? 'border-[#A61C14] bg-[#FAF6F0]' : 'border-stone-200 bg-white'
                }`}
              >
                <View className="flex-1 mr-2">
                  <View className="flex-row items-center flex-wrap">
                    {!!promo.user_id && (
                      <View className="bg-[#A61C14] px-1.5 py-0.5 rounded-full mr-1.5">
                        <Text className="text-[#F4ECE1] text-[9px] font-inter-bold uppercase">Your Prize</Text>
                      </View>
                    )}
                    <Text className="text-[13px] font-inter-bold text-[#1C1917] flex-shrink" numberOfLines={2}>
                      {promo.title}
                    </Text>
                  </View>
                  {row.freeItem ? (
                    <Text className="text-[13px] text-green-700 font-inter-semibold mt-0.5">
                      {row.inCart ? 'In your cart' : 'Free menu item · tap to choose'}
                    </Text>
                  ) : works ? (
                    <Text className="text-[13px] text-green-700 font-inter-semibold mt-0.5">Saves {money(row.savings)}</Text>
                  ) : (
                    !!row.unmet && (
                      <View className="flex-row items-start mt-0.5">
                        <Ionicons name="lock-closed" size={11} color="#B45309" style={{ marginTop: 2 }} />
                        <Text className="text-amber-700 text-[13px] font-inter-medium ml-1 flex-1">{row.unmet}</Text>
                      </View>
                    )
                  )}
                </View>
                {busyCode === promo.code ? (
                  <ActivityIndicator size="small" color="#A61C14" />
                ) : row.applied ? (
                  <View className="bg-[#A61C14] rounded-full p-1">
                    <Ionicons name="checkmark" size={12} color="#F4ECE1" />
                  </View>
                ) : (
                  <View className="bg-stone-100 px-2.5 py-1.5 rounded-lg">
                    <Text className="text-xs font-inter-bold text-[#1C1917]">{row.freeItem ? 'Claim' : 'Apply'}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* In a Modal so it covers the whole screen -- this component sits
          inside the cart's promo box. */}
      <Modal visible={!!picker} transparent animationType="none" onRequestClose={() => setPicker(null)}>
        {picker && (
          <PrizeItemPicker
            title={picker.promo.title}
            items={picker.items}
            onSelect={(selected) => {
              giveFreeItem(selected, picker.promo);
              setPicker(null);
            }}
            onClose={() => setPicker(null)}
          />
        )}
      </Modal>
    </View>
  );
}
