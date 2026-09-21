import { useCallback, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, Animated, Alert, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useLocationStore } from '../../store/locationStore';
import { usePromoStore, AppliedPromo } from '../../store/promoStore';
import { useCartStore } from '../../store/cartStore';
import { useBackHandler } from '../../hooks/useBackHandler';
import { EligiblePrizeItem, fetchEligiblePrizeItems, isPickAnItemPrize, itemHasModifiers } from '../../lib/prizeRedemption';
import PrizeItemPicker from '../../components/PrizeItemPicker';
import SkeletonBox from '../../components/Skeleton';

export default function DealsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useAuthStore();
  const locationId = useLocationStore(state => state.locationId);
  const { appliedPromo, setAppliedPromo } = usePromoStore();
  const incrementSimpleItem = useCartStore(state => state.incrementSimpleItem);
  const [toast, setToast] = useState<string | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const [resolvingCode, setResolvingCode] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ promo: any; items: EligiblePrizeItem[] } | null>(null);

  const goBack = useCallback(() => {
    router.replace(locationId ? `/(main)/menu/${locationId}` : '/(main)');
  }, [locationId]);
  useBackHandler(goBack);

  const { data: promotions, isLoading, error } = useQuery({
    queryKey: ['promotions', locationId, session?.user?.id, 'all'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('promotions')
        .select('*')
        .eq('is_active', true)
        .or(`location_id.eq.${locationId},location_id.is.null`)
        // Storewide promos (user_id null) plus this account's own personal
        // codes (e.g. a wheel-won prize -- see the spin_wheel migration) --
        // never another account's personal code.
        .or(`user_id.is.null,user_id.eq.${session?.user?.id}`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!locationId && !!session?.user?.id,
  });

  // promotions.single_use defaults to true (see the promo_single_use
  // migration) -- a past redemption is read straight off orders.promo_code
  // rather than a separate table, since that's already the exact record of
  // what this account has used.
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

  // Deals is a hidden tab (href: null) that stays mounted once visited
  // rather than unmounting on tab switch, so react-query's normal
  // mount/window-focus refetch triggers don't fire just from navigating
  // back here -- re-checking on every focus is what actually catches a
  // promo that got used/deactivated elsewhere (checkout already invalidates
  // these keys too, but this covers it even if that path is ever missed).
  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['promotions', locationId, session?.user?.id, 'all'] });
      queryClient.invalidateQueries({ queryKey: ['usedPromoCodes', session?.user?.id] });
    }, [locationId, session?.user?.id])
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

  const buildAppliedPromo = (promo: any): AppliedPromo => ({
    code: promo.code,
    title: promo.title,
    discountPercent: Number(promo.discount_percent) || 0,
    categoryId: promo.category_id,
    categoryName: promo.category_name,
    itemNamePatterns: promo.item_name_patterns,
    maxDiscountAmount: promo.max_discount_amount != null ? Number(promo.max_discount_amount) : null,
  });

  // Puts the actual free item straight into the cart instead of leaving the
  // customer to find and add it themselves and then hunt for a promo code
  // box -- applying the discount (existing coupon mechanism) and adding the
  // item happen together, from one tap.
  const giveFreeItem = (target: EligiblePrizeItem, promo: any) => {
    setAppliedPromo(buildAppliedPromo(promo));
    itemHasModifiers(target.id).then((hasModifiers) => {
      if (hasModifiers) {
        router.push(`/(main)/item/${target.id}`);
      } else if (locationId) {
        incrementSimpleItem({ menuItemId: target.id, name: target.name, basePrice: target.base_price }, locationId);
        showToast(`${target.name} added -- it's free!`);
      }
    });
  };

  const handleTogglePromo = async (item: any) => {
    if (!item.code || isAlreadyUsed(item) || resolvingCode) return;
    if (appliedPromo?.code === item.code) {
      setAppliedPromo(null);
      showToast('Promo removed');
      return;
    }

    if (isPickAnItemPrize(item) && locationId) {
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

    setAppliedPromo(buildAppliedPromo(item));
    showToast('Promo applied');
  };

  return (
    <View className="flex-1 bg-[#FAF6F0] pt-16 px-4">
      <View className="flex-row items-center mb-6">
        <TouchableOpacity
          onPress={goBack}
          className="flex-row items-center py-4 pr-8 -ml-2"
        >
          <Ionicons name="chevron-back" size={28} color="#A61C14" />
          <Text className="text-[#A61C14] font-bold text-xl">Back</Text>
        </TouchableOpacity>
        <Text className="text-2xl font-bold text-[#1C1917] ml-2">Deals</Text>
      </View>

      {isLoading ? (
        <View>
          {[1, 2].map(i => (
            <SkeletonBox key={i} height={110} borderRadius={16} style={{ marginBottom: 16 }} />
          ))}
        </View>
      ) : error ? (
        <View className="mt-10 items-center px-6">
          <Text className="text-[#A61C14] font-bold text-lg mb-2">Couldn't load deals</Text>
          <Text className="text-[#78716C] text-center">{(error as Error).message}</Text>
        </View>
      ) : (
        <FlatList
          data={promotions}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const isApplied = !!item.code && appliedPromo?.code === item.code;
            const alreadyUsed = !!item.code && isAlreadyUsed(item);
            const card = (
              <View
                className={`bg-white rounded-2xl border shadow-sm p-5 mb-4 ${
                  alreadyUsed ? 'opacity-50 border-stone-200' : isApplied ? 'border-[#A61C14]' : 'border-stone-200'
                }`}
              >
                <View className="flex-row items-center justify-between mb-1">
                  <Text className="text-lg font-bold text-[#1C1917] flex-1 mr-2">{item.title}</Text>
                  {isApplied && <Ionicons name="checkmark-circle" size={22} color="#A61C14" />}
                </View>
                {item.user_id && (
                  <View className="flex-row items-center mb-2">
                    <Ionicons name="gift-outline" size={14} color="#A61C14" />
                    <Text className="text-[#A61C14] text-xs font-bold uppercase tracking-wider ml-1">
                      Your Prize
                    </Text>
                  </View>
                )}
                {item.description && (
                  <Text className="text-[#78716C] mb-3">{item.description}</Text>
                )}
                {item.code && (
                  <View
                    className={`self-start flex-row items-center rounded-lg px-3 py-1.5 border ${
                      alreadyUsed
                        ? 'bg-stone-100 border-stone-300'
                        : isApplied
                        ? 'bg-[#A61C14] border-[#A61C14]'
                        : 'bg-[#FAF6F0] border-stone-300'
                    }`}
                  >
                    {resolvingCode === item.code && (
                      <ActivityIndicator size="small" color="#A61C14" style={{ marginRight: 6 }} />
                    )}
                    <Text
                      className={`font-bold tracking-wider ${
                        alreadyUsed ? 'text-[#78716C]' : isApplied ? 'text-[#F4ECE1]' : 'text-[#A61C14]'
                      }`}
                    >
                      {alreadyUsed
                        ? 'ALREADY REDEEMED'
                        : isApplied
                        ? 'APPLIED -- TAP TO REMOVE'
                        : isPickAnItemPrize(item)
                        ? 'TAP TO CHOOSE'
                        : `CODE: ${item.code}`}
                    </Text>
                  </View>
                )}
              </View>
            );

            return item.code && !alreadyUsed ? (
              <TouchableOpacity onPress={() => handleTogglePromo(item)} activeOpacity={0.8}>
                {card}
              </TouchableOpacity>
            ) : (
              card
            );
          }}
          ListEmptyComponent={
            <Text className="text-center text-[#78716C] mt-10 text-base">No deals right now -- check back soon!</Text>
          }
        />
      )}

      {toast && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            bottom: 40,
            left: 24,
            right: 24,
            opacity: toastOpacity,
          }}
        >
          <View className="bg-[#1C1917] rounded-full py-3 px-5 items-center">
            <Text className="text-[#F4ECE1] font-bold">{toast}</Text>
          </View>
        </Animated.View>
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
