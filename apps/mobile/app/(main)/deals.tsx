import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { useLocationStore } from '../../store/locationStore';
import { useNavStore } from '../../store/navStore';
import { usePromoStore } from '../../store/promoStore';
import { appliedPromoFromRow, hasCategoryScope, resolvePromoCategoryIds } from '../../lib/promoEligibility';
import { useCartStore } from '../../store/cartStore';
import { useBackHandler } from '../../hooks/useBackHandler';
import { isPromoUsed, useUsedPromoCodes } from '../../hooks/useUsedPromoCodes';
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
import ReferralCard from '../../components/ReferralCard';
import DealCard from '../../components/DealCard';
import DealBuilderSheet from '../../components/DealBuilderSheet';
import { isBundleDeal, useDealBuilderStore } from '../../store/dealBuilderStore';
import { Challenge } from '../../lib/challenges';

const NEXT_TIER_BY_POINTS = [
  { cost: 150, title: 'a Free Dip' },
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
  // Coming back from an item picked off the list: Deals is left exactly as
  // it was (list open, same photos, same scroll) -- see the focus effects.
  const pickerOpen = useRef(false);
  pickerOpen.current = !!picker;
  useEffect(() => {
    if (picker && items.some((i) => i.promoCode === picker.promo.code)) setPicker(null);
  }, [picker, items]);

  // Back to the Menu once an order's started; until then, back to Home --
  // the same rule as the first tab (store/navStore.ts).
  const orderStarted = useNavStore((state) => state.orderStarted);
  const backToMenu = orderStarted && !!locationId;
  const goBack = useCallback(() => {
    router.replace(backToMenu ? `/(main)/menu/${locationId}` : '/(main)');
  }, [backToMenu, locationId, router]);
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

  // A photo of the food each deal is for, picked at random from the right
  // part of the menu -- a Mob deal gets a Mob sandwich, a drink deal a
  // drink, and so on -- and a fresh pick each time Deals is opened. No two
  // deals share a photo while there are others to choose from.
  const { data: menuPhotos } = useQuery({
    queryKey: ['dealPhotos'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('menu_items')
        .select('name, image_url, is_available, is_catering, drop_starts_at, menu_categories ( id, name, is_secret )')
        .not('image_url', 'is', null)
        .limit(1000);
      if (error) throw error;
      return (data || []) as any[];
    },
    staleTime: 30 * 60000,
  });

  const [photoSeed, setPhotoSeed] = useState(() => Math.floor(Math.random() * 1e9));
  useFocusEffect(
    useCallback(() => {
      if (pickerOpen.current) return;
      setPhotoSeed(Math.floor(Math.random() * 1e9));
    }, [])
  );

  const dealPhotos = useMemo(() => {
    const photos = new Map<string, string>();
    const lower = (v: string) => v.trim().toLowerCase();
    // One photo per dish (each store has its own copy of every item).
    const seen = new Set<string>();
    const dishes = (menuPhotos ?? []).filter((m) => {
      if (!m.image_url || m.is_available === false || m.is_catering || m.drop_starts_at || m.menu_categories?.is_secret) {
        return false;
      }
      const key = lower(m.name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (!dishes.length || !sortedPromotions) return photos;

    const inCategories = (names: string[]) => {
      const wanted = new Set(names.map(lower));
      return dishes.filter((m) => m.menu_categories?.name && wanted.has(lower(m.menu_categories.name)));
    };
    // What a deal is for: its category (narrowed to named items, e.g.
    // Specialty Fries), else what its name and description talk about,
    // else a main -- a sandwich or a wrap -- for a whole-order deal.
    const candidatesFor = (promo: any): any[] => {
      let pool: any[] = [];
      const categoryNames = [...(promo.category_names ?? []), promo.category_name].filter(Boolean);
      if (categoryNames.length) pool = inCategories(categoryNames);
      if (!pool.length && promo.category_id) pool = dishes.filter((m) => m.menu_categories?.id === promo.category_id);
      if (pool.length && promo.item_name_patterns?.length) {
        const patterns = promo.item_name_patterns.map(lower);
        const named = pool.filter((m) => patterns.includes(lower(m.name)));
        if (named.length) pool = named;
      }
      if (pool.length) return pool;

      const text = lower(`${promo.title ?? ''} ${promo.description ?? ''}`);
      if (/\bmob\b|sandwich|panin/.test(text)) pool = inCategories(['The Mob']);
      else if (/wrap/.test(text)) pool = inCategories(["Al's Wraps"]);
      else if (/drink|\bpop\b|soda|beverage/.test(text)) pool = inCategories(['Drinks']);
      else if (/fries|\bside/.test(text)) pool = inCategories(['Sides']);
      if (!pool.length) pool = inCategories(['The Mob', "Al's Wraps"]);
      return pool.length ? pool : dishes;
    };

    // A small seeded random, so the picks hold still while Deals is open
    // and change the next time it's opened.
    let state = photoSeed || 1;
    const random = () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
    const used = new Set<string>();
    for (const promo of sortedPromotions as any[]) {
      const pool = candidatesFor(promo);
      const fresh = pool.filter((m) => !used.has(m.image_url));
      const from = fresh.length ? fresh : pool;
      const pick = from[Math.floor(random() * from.length)];
      if (pick) {
        used.add(pick.image_url);
        photos.set(promo.id, pick.image_url);
      }
    }
    return photos;
  }, [menuPhotos, sortedPromotions, photoSeed]);

  const { data: usedCodes } = useUsedPromoCodes();

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
      if (pickerOpen.current) return;
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

  const isAlreadyUsed = (item: any) => isPromoUsed(item, usedCodes);

  // An item with options opens on its own screen, and the pick list stays
  // open behind it -- back from there lands here with the list as it was.
  // It closes once the reward is in the cart.
  const giveFreeItem = (target: EligiblePrizeItem, promo: any) => {
    itemHasModifiers(target.id).then((hasModifiers) => {
      if (hasModifiers) {
        router.push({
          pathname: `/(main)/item/${target.id}`,
          params: { promoCode: promo.code, promoTitle: promo.title, returnTo: 'deals' },
        });
      } else if (locationId) {
        setPicker(null);
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

    // "Buy 2 or more" deals are built meal by meal (DealBuilderSheet).
    if (isBundleDeal(item)) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      useDealBuilderStore.getState().start(item);
      return;
    }

    const applied = appliedPromoFromRow(item);
    setAppliedPromo(applied);

    // Money-off-the-order deals ($3 off pickup, $7 off $40...) just apply --
    // the card turns green and that's it.
    if (!hasCategoryScope(applied)) {
      showToast('Promo applied');
      return;
    }

    // A deal on part of the menu (25% off The Mob) applies, then opens that
    // part of the menu -- after a beat, so the card is seen turning green.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    showToast("Deal applied -- let's find your food");
    const target = locationId;
    if (!target) return;
    setTimeout(async () => {
      const ids = await resolvePromoCategoryIds(applied, target);
      if (ids?.length === 1) {
        const { data: cats } = await (supabase as any).from('menu_categories').select('id, name').in('id', ids);
        const category = (cats ?? [])[0];
        if (category) {
          router.push({
            pathname: '/(main)/menu-category',
            params: { categoryId: category.id, categoryName: category.name, locationId: target },
          });
          return;
        }
      }
      router.replace(`/(main)/menu/${target}`);
    }, 650);
  };

  // The Mix & Match builder shows over Deals only while Deals is on screen
  // -- it steps aside while a meal is being picked, and is back on return.
  const builderOpen = useDealBuilderStore((state) => state.open);
  const [dealsFocused, setDealsFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setDealsFocused(true);
      return () => setDealsFocused(false);
    }, [])
  );

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
            <Text className="text-[#A61C14] font-inter-bold text-base">{backToMenu ? 'Menu' : 'Home'}</Text>
          </TouchableOpacity>
          <Text className="text-2xl font-display-bold text-[#1C1917] tracking-tight ml-1">Rewards & Deals</Text>
        </View>

        {!isAnonymous && (
          <View className="bg-white border border-stone-200 px-3 py-1.5 rounded-full flex-row items-center shadow-sm">
            <Ionicons name="sparkles" size={14} color="#A61C14" />
            <Text className="text-[#1C1917] font-inter-bold text-xs ml-1.5">
              {currentPoints.toLocaleString()} pts
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
                  Get 10 points for every $1 -- a free dip at 150, a drink at 300, a side at 600, a sandwich at 1,200 -- plus a free
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
            // The whole card opens Profile, where points are redeemed.
            <TouchableOpacity
              onPress={() => router.push('/(main)/profile')}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="PaninoPoints balance. Opens Profile to redeem rewards."
              className="bg-white p-5 rounded-3xl border border-stone-200 shadow-sm mb-4"
            >
              <View className="flex-row justify-between items-center mb-2">
                <View>
                  <Text className="text-xs font-inter-bold uppercase tracking-wider text-stone-500">
                    PaninoPoints Balance
                  </Text>
                  <Text className="text-3xl font-display-bold text-[#1C1917] tracking-tight mt-0.5">
                    {currentPoints.toLocaleString()}{' '}
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

              <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-stone-100">
                <Text className="text-[#A61C14] font-inter-bold text-sm">Redeem your rewards</Text>
                <Ionicons name="chevron-forward" size={18} color="#A61C14" />
              </View>
            </TouchableOpacity>
            )}

            {!isAnonymous && <ReferralCard compact />}

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
              photo={dealPhotos.get(item.id) ?? null}
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

      <DealBuilderSheet
        visible={builderOpen && dealsFocused}
        onPickMeal={(slot) => router.push({ pathname: '/(main)/deal-pick', params: { slot: String(slot) } })}
        onConfirmed={({ promo, meals, saved }) => {
          setAppliedPromo(appliedPromoFromRow(promo));
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          showToast(
            saved > 0
              ? `${meals} meals added -- you saved $${saved.toFixed(2)}!`
              : `${meals} meals added to your cart`
          );
        }}
      />

      {picker && (
        <PrizeItemPicker
          title={picker.promo.title}
          items={picker.items}
          onSelect={(selected) => giveFreeItem(selected, picker.promo)}
          onClose={() => setPicker(null)}
        />
      )}
    </View>
  );
}