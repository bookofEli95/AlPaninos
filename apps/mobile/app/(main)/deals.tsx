import { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Animated,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useLocationStore } from '../../store/locationStore';
import { usePromoStore } from '../../store/promoStore';
import { appliedPromoFromRow, describePromoRequirements } from '../../lib/promoEligibility';
import { useCartStore } from '../../store/cartStore';
import { useBackHandler } from '../../hooks/useBackHandler';
import {
  EligiblePrizeItem,
  fetchEligiblePrizeItems,
  isPickAnItemPrize,
  itemHasModifiers,
} from '../../lib/prizeRedemption';
import PrizeItemPicker from '../../components/PrizeItemPicker';
import SkeletonBox from '../../components/Skeleton';

const NEXT_TIER_BY_POINTS = [
  { cost: 300, title: 'a Free Beverage' },
  { cost: 600, title: 'a Free Specialty Side' },
  { cost: 1200, title: 'a Free Signature Sandwich' },
];

export default function DealsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useAuthStore();
  const locationId = useLocationStore((state) => state.locationId);
  const { appliedPromo, setAppliedPromo } = usePromoStore();
  const items = useCartStore((state) => state.items);
  const addFreeItem = useCartStore((state) => state.addFreeItem);
  const removeItemsByPromoCode = useCartStore((state) => state.removeItemsByPromoCode);

  const [toast, setToast] = useState<string | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const [resolvingCode, setResolvingCode] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ promo: any; items: EligiblePrizeItem[] } | null>(null);

  const goBack = useCallback(() => {
    router.replace(locationId ? `/(main)/menu/${locationId}` : '/(main)');
  }, [locationId, router]);
  useBackHandler(goBack);

  // Its own key, not ['profile', id] -- profile.tsx caches the full row
  // (select '*') under that exact key, and sharing it with this partial
  // select meant whichever screen loaded first decided what the other saw
  // (e.g. Profile showing no last name/phone/address right after signup).
  // Invalidating ['profile', id] still refreshes this too (prefix match).
  const { data: profile } = useQuery({
    queryKey: ['profile', session?.user?.id, 'deals'],
    queryFn: async () => {
      if (!session?.user?.id) return null;
      const { data, error } = await (supabase as any)
        .from('profiles')
        .select('panino_points, first_name')
        .eq('id', session.user.id)
        .maybeSingle();
      if (error) return null;
      return data;
    },
    enabled: !!session?.user?.id,
  });

  const { data: promotions, isLoading, error } = useQuery({
    queryKey: ['promotions', locationId, session?.user?.id, 'all'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('promotions')
        .select('*')
        .eq('is_active', true)
        .or(`location_id.eq.${locationId},location_id.is.null`)
        .or(`user_id.is.null,user_id.eq.${session?.user?.id}`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!locationId && !!session?.user?.id,
  });

  const { data: usedCodes } = useQuery({
    queryKey: ['usedPromoCodes', session?.user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('promo_code')
        .eq('user_id', session!.user.id)
        .not('promo_code', 'is', null);
      if (error) throw error;
      return new Set((data || []).map((o: any) => o.promo_code.toLowerCase()));
    },
    enabled: !!session?.user?.id,
  });

  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({
        queryKey: ['promotions', locationId, session?.user?.id, 'all'],
      });
      queryClient.invalidateQueries({ queryKey: ['usedPromoCodes', session?.user?.id] });
      queryClient.invalidateQueries({ queryKey: ['profile', session?.user?.id] });
    }, [locationId, session?.user?.id, queryClient])
  );

  const showToast = (message: string) => {
    setToast(message);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.delay(1500),
      Animated.timing(toastOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setToast(null));
  };

  const isAlreadyUsed = (item: any) =>
    item.single_use !== false && !!usedCodes?.has(item.code?.toLowerCase());

  const giveFreeItem = (target: EligiblePrizeItem, promo: any) => {
    itemHasModifiers(target.id).then((hasModifiers) => {
      if (hasModifiers) {
        router.push({
          pathname: `/(main)/item/${target.id}`,
          params: { promoCode: promo.code, promoTitle: promo.title },
        });
      } else if (locationId) {
        addFreeItem(
          { menuItemId: target.id, name: target.name, basePrice: target.base_price, imageUrl: target.image_url },
          locationId,
          promo.code
        );
        showToast(`${target.name} added -- it's free!`);
      }
    });
  };

  const handleTogglePromo = async (item: any) => {
    if (!item.code || isAlreadyUsed(item) || resolvingCode) return;

    if (isPickAnItemPrize(item)) {
      if (items.some((i) => i.promoCode === item.code)) {
        removeItemsByPromoCode(item.code);
        showToast('Removed from cart');
        return;
      }
      if (!locationId) return;
      setResolvingCode(item.code);
      try {
        const eligibleItems = await fetchEligiblePrizeItems(item, locationId);
        if (eligibleItems.length === 0) {
          Alert.alert('Not Available', "This prize isn't available at this location right now.");
        } else if (eligibleItems.length === 1) {
          giveFreeItem(eligibleItems[0], item);
        } else {
          setPicker({ promo: item, items: eligibleItems });
        }
      } finally {
        setResolvingCode(null);
      }
      return;
    }

    if (appliedPromo?.code === item.code) {
      setAppliedPromo(null);
      showToast('Promo removed');
      return;
    }
    setAppliedPromo(appliedPromoFromRow(item));
    showToast('Promo applied');
  };

  const currentPoints = profile?.panino_points ?? 0;
  const nextTier =
    NEXT_TIER_BY_POINTS.find((t) => t.cost > currentPoints) ??
    NEXT_TIER_BY_POINTS[NEXT_TIER_BY_POINTS.length - 1];
  const pointsProgress = Math.min(100, Math.round((currentPoints / nextTier.cost) * 100));
  const hasCartItems = items.length > 0;
  // A coupon applied here with nothing in the cart used to leave the
  // customer on this screen with no obvious next step. Once anything is in
  // the cart, the shared floating "View Cart" bar ((main)/_layout.tsx) takes
  // this spot instead, so the two never stack.
  const showStartOrderBar = !!appliedPromo && !hasCartItems;
  const hasBottomBar = hasCartItems || showStartOrderBar;

  return (
    <View className="flex-1 bg-[#FAF6F0] pt-14">
      {/* Header with Live Points Balance Badge */}
      <View className="flex-row items-center justify-between px-4 mb-4">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={goBack} className="flex-row items-center py-2 pr-3 -ml-2">
            <Ionicons name="chevron-back" size={26} color="#A61C14" />
            <Text className="text-[#A61C14] font-inter-bold text-base">Menu</Text>
          </TouchableOpacity>
          <Text className="text-2xl font-display-bold text-[#1C1917] tracking-tight ml-1">Rewards & Deals</Text>
        </View>

        <View className="bg-white border border-stone-200 px-3 py-1.5 rounded-full flex-row items-center shadow-sm">
          <Ionicons name="sparkles" size={14} color="#A61C14" />
          <Text className="text-[#1C1917] font-inter-bold text-xs ml-1.5">
            {currentPoints} pts
          </Text>
        </View>
      </View>

      <FlatList
        data={promotions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: hasBottomBar ? 96 : 32 }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View className="mb-4">
            <View className="bg-white p-5 rounded-3xl border border-stone-200 shadow-sm mb-4">
              <View className="flex-row justify-between items-center mb-2">
                <View>
                  <Text className="text-xs font-inter-bold uppercase tracking-wider text-stone-500">
                    PaninoPoints Balance
                  </Text>
                  <Text className="text-3xl font-display-bold text-[#1C1917] tracking-tight mt-0.5">
                    {currentPoints}{' '}
                    <Text className="text-sm font-inter-semibold text-stone-500">pts</Text>
                  </Text>
                </View>
                <View className="w-12 h-12 rounded-2xl bg-[#FAF6F0] border border-stone-200 items-center justify-center">
                  <Ionicons name="gift-outline" size={22} color="#A61C14" />
                </View>
              </View>

              <View className="w-full bg-stone-100 h-2.5 rounded-full overflow-hidden mt-2 mb-2">
                <View
                  className="bg-[#A61C14] h-full rounded-full"
                  style={{ width: `${pointsProgress}%` }}
                />
              </View>

              <Text className="text-xs text-stone-600 font-inter-medium">
                {currentPoints >= nextTier.cost
                  ? `🎉 You have enough points for ${nextTier.title}!`
                  : `${nextTier.cost - currentPoints} more points until ${nextTier.title}`}
              </Text>
            </View>

            <Text className="text-base font-inter-bold text-[#1C1917] mb-2 px-1">
              Available Offers & Prizes
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isApplied =
            !!item.code &&
            (isPickAnItemPrize(item)
              ? items.some((i) => i.promoCode === item.code)
              : appliedPromo?.code === item.code);
          const alreadyUsed = !!item.code && isAlreadyUsed(item);

          return (
            <TouchableOpacity
              onPress={() => handleTogglePromo(item)}
              disabled={alreadyUsed || !item.code}
              activeOpacity={0.8}
              className={`bg-white rounded-2xl border p-4 mb-3 shadow-sm ${
                alreadyUsed
                  ? 'opacity-50 border-stone-200'
                  : isApplied
                  ? 'border-[#A61C14] bg-[#FAF6F0]/40'
                  : 'border-stone-200'
              }`}
            >
              <View className="flex-row items-start justify-between mb-1.5">
                <View className="flex-1 mr-2">
                  <View className="flex-row items-center flex-wrap gap-1.5 mb-1">
                    {item.user_id && (
                      <View className="bg-[#A61C14] px-2 py-0.5 rounded-full">
                        <Text className="text-[#F4ECE1] text-[10px] font-inter-bold uppercase">
                          Your Prize
                        </Text>
                      </View>
                    )}
                    <Text className="text-base font-inter-bold text-[#1C1917]">{item.title}</Text>
                  </View>
                  {item.description && (
                    <Text className="text-stone-500 text-xs leading-4">{item.description}</Text>
                  )}
                  {describePromoRequirements(item).length > 0 && (
                    <View className="flex-row flex-wrap mt-2">
                      {describePromoRequirements(item).map((tag) => (
                        <View key={tag} className="bg-[#FAF6F0] border border-stone-200 rounded-md px-2 py-0.5 mr-1.5 mb-1">
                          <Text className="text-stone-600 text-[11px] font-inter-semibold">{tag}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                {isApplied && (
                  <View className="bg-[#A61C14] rounded-full p-1">
                    <Ionicons name="checkmark" size={14} color="#F4ECE1" />
                  </View>
                )}
              </View>

              <View className="flex-row items-center justify-between mt-3 pt-2.5 border-t border-stone-100">
                <View className="flex-row items-center">
                  <Ionicons name="pricetag-outline" size={14} color="#78716C" />
                  <Text className="text-xs font-inter-semibold text-stone-600 ml-1.5 uppercase tracking-wide">
                    {alreadyUsed
                      ? 'Already Redeemed'
                      : isPickAnItemPrize(item)
                      ? 'Free Menu Item'
                      : `Code: ${item.code}`}
                  </Text>
                </View>

                <View
                  className={`px-3 py-1.5 rounded-xl flex-row items-center ${
                    alreadyUsed
                      ? 'bg-stone-100'
                      : isApplied
                      ? 'bg-[#A61C14]'
                      : 'bg-stone-100'
                  }`}
                >
                  {resolvingCode === item.code && (
                    <ActivityIndicator
                      size="small"
                      color="#A61C14"
                      style={{ marginRight: 4 }}
                    />
                  )}
                  <Text
                    className={`text-xs font-inter-bold ${
                      alreadyUsed
                        ? 'text-stone-400'
                        : isApplied
                        ? 'text-[#F4ECE1]'
                        : 'text-[#1C1917]'
                    }`}
                  >
                    {alreadyUsed
                      ? 'Redeemed'
                      : isApplied
                      ? 'Applied'
                      : isPickAnItemPrize(item)
                      ? 'Claim Item'
                      : 'Apply Offer'}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          isLoading ? (
            <View>
              {[1, 2, 3].map((i) => (
                <SkeletonBox key={i} height={100} borderRadius={16} style={{ marginBottom: 12 }} />
              ))}
            </View>
          ) : error ? (
            <View className="mt-8 items-center px-6">
              <Text className="text-[#A61C14] font-inter-bold text-base mb-1">
                Couldn't load deals
              </Text>
              <Text className="text-stone-500 text-center text-xs">{(error as Error).message}</Text>
            </View>
          ) : (
            <Text className="text-center text-stone-500 mt-8 text-sm font-inter-medium">
              No active offers right now. Check back soon!
            </Text>
          )
        }
      />

      {toast && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            bottom: hasBottomBar ? 96 : 32,
            left: 24,
            right: 24,
            opacity: toastOpacity,
          }}
        >
          <View className="bg-[#1C1917] rounded-full py-2.5 px-5 items-center shadow-md">
            <Text className="text-[#F4ECE1] font-inter-semibold text-xs">{toast}</Text>
          </View>
        </Animated.View>
      )}

      {showStartOrderBar && (
        <View className="absolute bottom-5 left-4 right-4">
          <TouchableOpacity
            onPress={goBack}
            activeOpacity={0.9}
            className="bg-[#A61C14] py-3.5 px-4 rounded-2xl flex-row items-center justify-between shadow-lg active:bg-[#85140E]"
          >
            <View className="flex-row items-center flex-1 mr-3">
              <Ionicons name="checkmark-circle" size={18} color="#F4ECE1" />
              <View className="ml-2 flex-1">
                <Text className="text-[#F4ECE1] opacity-80 font-inter-bold text-[11px] uppercase tracking-wider">
                  Promo Applied
                </Text>
                <Text className="text-[#F4ECE1] font-inter-bold text-sm" numberOfLines={1}>
                  {appliedPromo?.title}
                </Text>
              </View>
            </View>
            <View className="flex-row items-center">
              <Text className="text-[#F4ECE1] font-inter-bold text-base mr-1.5">Start Order</Text>
              <Ionicons name="arrow-forward" size={16} color="#F4ECE1" />
            </View>
          </TouchableOpacity>
        </View>
      )}

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
    </View>
  );
}