import { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Animated,
} from 'react-native';
import { Alert } from '../../lib/alert';
import { useRouter, useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useLocationStore } from '../../store/locationStore';
import { usePromoStore } from '../../store/promoStore';
import { appliedPromoFromRow } from '../../lib/promoEligibility';
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
import AccountSetupSheet from '../../components/AccountSetupSheet';
import ChallengeCard from '../../components/ChallengeCard';
import DealCard from '../../components/DealCard';
import { Challenge } from '../../lib/challenges';

const NEXT_TIER_BY_POINTS = [
  { cost: 300, title: 'a Free Beverage' },
  { cost: 600, title: 'a Free Specialty Side' },
  { cost: 1200, title: 'a Free Signature Sandwich' },
];

export default function DealsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useAuthStore();
  // Guests can't earn or redeem PaninoPoints, so they see a join card
  // instead of a balance (always 0) they can't do anything with.
  const isAnonymous = session?.user?.is_anonymous ?? false;
  const [setupVisible, setSetupVisible] = useState(false);
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

  // The customer's own prizes first -- they're what people are most drawn
  // to -- then everything else, newest first.
  const sortedPromotions = useMemo(
    () => (promotions ? [...promotions].sort((a: any, b: any) => Number(!!b.user_id) - Number(!!a.user_id)) : promotions),
    [promotions]
  );

  // A photo of the food each deal is for (every store's menu, one photo per
  // dish). A whole-order deal gets a sandwich -- the star of the menu.
  const { data: menuPhotos } = useQuery({
    queryKey: ['dealPhotos'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('menu_items')
        .select('name, image_url, is_available, menu_categories ( id, name )')
        .not('image_url', 'is', null)
        .order('name')
        .limit(1000);
      if (error) throw error;
      return (data || []) as any[];
    },
    staleTime: 30 * 60000,
  });

  const photoFor = useCallback(
    (promo: any): string | null => {
      const all = (menuPhotos ?? []).filter((m) => m.is_available !== false && m.image_url);
      if (!all.length) return null;
      const lower = (v: string) => v.trim().toLowerCase();
      const categoryNames = new Set<string>(
        [...(promo.category_names ?? []), promo.category_name].filter(Boolean).map(lower)
      );
      const inCategory = all.filter(
        (m) =>
          (m.menu_categories?.name && categoryNames.has(lower(m.menu_categories.name))) ||
          (!!promo.category_id && m.menu_categories?.id === promo.category_id)
      );
      const patterns = (promo.item_name_patterns ?? []).map(lower);
      const matching = patterns.length ? inCategory.filter((m) => patterns.includes(lower(m.name))) : inCategory;
      const pick =
        matching[0] ??
        inCategory[0] ??
        all.find((m) => m.menu_categories?.name === 'The Mob') ??
        all[0];
      return pick?.image_url ?? null;
    },
    [menuPhotos]
  );

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

  const { data: challenges } = useQuery({
    queryKey: ['challenges', session?.user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_my_challenges');
      if (error) throw error;
      return (data || []) as Challenge[];
    },
    // Challenges are for account holders -- guests don't see them.
    enabled: !!session?.user?.id && !isAnonymous,
  });

  // Deals is a tab, so it stays mounted (and keeps its scroll position)
  // while the customer is elsewhere -- start back at the top every time
  // it's opened instead.
  const listRef = useRef<FlatList>(null);
  useFocusEffect(
    useCallback(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['challenges', session?.user?.id] });
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

        {!isAnonymous && (
          <View className="bg-white border border-stone-200 px-3 py-1.5 rounded-full flex-row items-center shadow-sm">
            <Ionicons name="sparkles" size={14} color="#A61C14" />
            <Text className="text-[#1C1917] font-inter-bold text-xs ml-1.5">
              {currentPoints} pts
            </Text>
          </View>
        )}
      </View>

      <FlatList
        ref={listRef}
        data={sortedPromotions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: hasBottomBar ? 96 : 32 }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View className="mb-4">
            {isAnonymous ? (
              <View className="bg-white p-5 rounded-3xl border border-stone-200 shadow-sm mb-4">
                <View className="flex-row justify-between items-center mb-2">
                  <View className="flex-1 mr-3">
                    <Text className="text-xs font-inter-bold uppercase tracking-wider text-stone-500">PaninoPoints</Text>
                    <Text className="text-lg font-inter-bold text-[#1C1917] mt-0.5">Earn free food with an account</Text>
                  </View>
                  <View className="w-12 h-12 rounded-2xl bg-[#FAF6F0] border border-stone-200 items-center justify-center">
                    <Ionicons name="gift-outline" size={22} color="#A61C14" />
                  </View>
                </View>
                <Text className="text-xs text-stone-600 font-inter-medium mb-3">
                  Get 10 points for every $1 -- a free drink at 300, a side at 600, a sandwich at 1,200 -- plus a free
                  spin on the welcome wheel. Your cart comes with you.
                </Text>
                <TouchableOpacity
                  onPress={() => setSetupVisible(true)}
                  className="bg-[#A61C14] py-3 rounded-xl items-center active:bg-[#85140E]"
                >
                  <Text className="text-[#F4ECE1] font-inter-bold text-sm">Create Free Account</Text>
                </TouchableOpacity>
              </View>
            ) : (
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
            )}

            {!isAnonymous && !!challenges?.length && (
              <View className="mb-2">
                <Text className="text-base font-inter-bold text-[#1C1917] mb-0.5 px-1">Challenges</Text>
                <Text className="text-xs text-stone-500 mb-2.5 px-1">
                  Bonus points on top of your usual 10 per $1.
                </Text>
                {challenges.map((challenge) => (
                  <ChallengeCard key={challenge.id} challenge={challenge} />
                ))}
              </View>
            )}

            <Text className="text-base font-inter-bold text-[#1C1917] mb-2 px-1">
              Available Offers & Prizes
            </Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const isItemPrize = isPickAnItemPrize(item);
          const isApplied =
            !!item.code &&
            (isItemPrize ? items.some((i) => i.promoCode === item.code) : appliedPromo?.code === item.code);
          return (
            <DealCard
              promo={item}
              index={index}
              photo={photoFor(item)}
              applied={isApplied}
              used={!!item.code && isAlreadyUsed(item)}
              loading={resolvingCode === item.code}
              isItemPrize={isItemPrize}
              onPress={() => handleTogglePromo(item)}
            />
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

      <AccountSetupSheet
        visible={setupVisible}
        mode="upgrade"
        onClose={() => setSetupVisible(false)}
        onDone={() => {
          setSetupVisible(false);
          Alert.alert('Account Created!', 'Your cart is saved to your new account, and your welcome spin is waiting.', [
            { text: 'Later', style: 'cancel' },
            { text: 'Spin the Wheel', onPress: () => router.replace('/(main)/spin-wheel') },
          ]);
        }}
      />

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