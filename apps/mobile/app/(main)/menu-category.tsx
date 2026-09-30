import { useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, FlatList } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useCartStore } from '../../store/cartStore';
import { useBackHandler } from '../../hooks/useBackHandler';
import SkeletonBox from '../../components/Skeleton';
import MenuItemGridTile from '../../components/MenuItemGridTile';
import CateringPlanner from '../../components/CateringPlanner';
import FanFavourites from '../../components/FanFavourites';
import { useFanFavourites } from '../../hooks/useFanFavourites';
import { isDropVisible } from '../../lib/drops';
import { useAuthStore } from '../../store/authStore';
import { usePromoStore } from '../../store/promoStore';
import { isBundleDeal, useDealBuilderStore } from '../../store/dealBuilderStore';
import { dealValue } from '../../components/DealCard';
import { useUsedPromoCodes } from '../../hooks/useUsedPromoCodes';
import { bestCategoryDeal } from '../../lib/categoryDeals';
import { appliedPromoFromRow } from '../../lib/promoEligibility';
import * as Haptics from 'expo-haptics';

export default function MenuCategoryScreen() {
  const { categoryId, categoryName, locationId } = useLocalSearchParams<{
    categoryId: string;
    categoryName: string;
    locationId: string;
  }>();
  const router = useRouter();
  const cartItems = useCartStore((state) => state.items);
  const cartQuantity = useMemo(() => cartItems.reduce((sum, item) => sum + item.quantity, 0), [cartItems]);

  const goBackToGrid = useCallback(() => {
    router.replace(locationId ? `/(main)/menu/${locationId}` : '/(main)');
  }, [locationId, router]);
  useBackHandler(goBackToGrid);

  const isSimpleCategory = categoryName === 'Extras' || categoryName === 'Drinks';

  const { data: items, isLoading, error } = useQuery({
    queryKey: ['menuCategoryItems', categoryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('menu_items')
        .select('*')
        .eq('category_id', categoryId)
        .eq('is_available', true)
        .order('name', { ascending: true });
      if (error) throw error;
      // Drops that have ended disappear; upcoming ones stay as a teaser.
      return (data || []).filter((i: any) => isDropVisible(i));
    },
    enabled: !!categoryId,
  });

  // The Secret Mob also shows the store's Fan Favourites.
  const { data: category } = useQuery({
    queryKey: ['menuCategory', categoryId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('menu_categories').select('is_secret').eq('id', categoryId).maybeSingle();
      if (error) throw error;
      return data as { is_secret: boolean } | null;
    },
    enabled: !!categoryId,
  });
  const isSecret = !!category?.is_secret;
  const { data: favourites } = useFanFavourites(isSecret ? locationId : null);
  const hasFavourites = isSecret && !!favourites?.length;

  // Deals on this category, as a banner at the top -- the deal is seen right
  // where the food is picked. Same list (and cache) as the Menu screen's.
  const userId = useAuthStore((state) => state.session?.user?.id);
  const appliedCode = usePromoStore((state) => state.appliedPromo?.code);
  const setAppliedPromo = usePromoStore((state) => state.setAppliedPromo);
  const { data: usedCodes } = useUsedPromoCodes();
  const { data: promotions } = useQuery({
    queryKey: ['promotions', locationId, userId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('promotions')
        .select('*')
        .eq('is_active', true)
        .or(`location_id.eq.${locationId},location_id.is.null`);
      if (error) throw error;
      return data;
    },
    enabled: !!locationId,
  });
  // The same deal the Menu tags this category with (lib/categoryDeals) --
  // never one they've already used.
  const categoryDeal = useMemo(
    () => bestCategoryDeal(promotions, { id: categoryId, name: categoryName ?? '' }, usedCodes),
    [promotions, categoryId, categoryName, usedCodes]
  );
  const dealApplied = !!categoryDeal && appliedCode === categoryDeal.code;
  // Something from this category is already in the cart (and paid for, not
  // a free reward) -- i.e. there's a saving to go and see.
  const hasQualifyingItem = useMemo(
    () => cartItems.some((c) => !c.promoCode && (items || []).some((i: any) => i.id === c.menuItemId)),
    [cartItems, items]
  );

  // Tapping the banner: a Mix & Match opens its builder; any other deal on
  // this category applies right here (they're already where its food is).
  // Once applied it opens the cart -- but only when there's something in it
  // the deal applies to; before that, the banner just says to pick below.
  const handleDealPress = () => {
    if (!categoryDeal) return;
    if (dealApplied) {
      if (hasQualifyingItem) router.push('/(main)/cart');
      return;
    }
    if (isBundleDeal(categoryDeal)) {
      useDealBuilderStore.getState().start(categoryDeal);
      router.push('/(main)/deals');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setAppliedPromo(appliedPromoFromRow(categoryDeal));
  };

  // The catering category gets the "how many are you feeding" planner.
  const plannerPackages = useMemo(
    () => (items || []).filter((i: any) => i.is_catering && i.catering_role) as any[],
    [items]
  );

  return (
    <View className="flex-1 bg-[#FAF6F0] pt-14">
      <View className="flex-row items-center justify-between px-4 mb-4">
        <View className="flex-row items-center flex-1 mr-2">
          <TouchableOpacity
            onPress={goBackToGrid}
            className="flex-row items-center py-2 pr-3 -ml-2"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-back" size={26} color="#A61C14" />
            <Text className="text-[#A61C14] font-inter-bold text-base">Menu</Text>
          </TouchableOpacity>
          <View className="flex-1 ml-1">
            <Text className="text-2xl font-display-bold text-[#1C1917] tracking-tight" numberOfLines={1}>
              {categoryName}
            </Text>
            {!!items?.length && !isLoading && (
              <Text className="text-[13px] text-stone-500 font-inter-medium">
                {items.length} {items.length === 1 ? 'item' : 'items'} •{' '}
                {items.some((i: any) => i.is_catering)
                  ? 'Order by 6 PM for tomorrow'
                  : items.some((i: any) => i.drop_starts_at || i.drop_ends_at)
                  ? 'App only • While they last'
                  : 'Made fresh'}
              </Text>
            )}
          </View>
        </View>

        <TouchableOpacity
          onPress={() => router.push('/(main)/cart')}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="bg-white border border-stone-200 rounded-full p-2.5 shadow-sm relative"
        >
          <Ionicons name="bag-handle-outline" size={20} color="#1C1917" />
          {cartQuantity > 0 && (
            <View
              className="absolute -top-1 -right-1 bg-[#A61C14] rounded-full items-center justify-center border-2 border-white"
              style={{ minWidth: 18, height: 18, paddingHorizontal: 3 }}
            >
              <Text className="text-[#F4ECE1] font-inter-bold text-[11px] leading-3">
                {cartQuantity}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {!!categoryDeal && (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleDealPress}
          disabled={dealApplied && !hasQualifyingItem}
          className={`mx-4 mb-3 rounded-2xl flex-row items-center px-3 py-2.5 ${dealApplied ? 'bg-[#15803D]' : 'bg-[#A61C14]'}`}
        >
          <View className="bg-[#FFC72C] rounded-xl px-2.5 py-1.5 mr-3">
            <Text className="text-[#7A0E0A] font-inter-extrabold text-sm">
              {`${dealValue(categoryDeal).big} ${dealValue(categoryDeal).small}`.trim()}
            </Text>
          </View>
          <View className="flex-1 mr-2">
            <Text className="text-[#F4ECE1] font-inter-bold text-sm" numberOfLines={1}>
              {categoryDeal.title}
            </Text>
            <Text className="text-[#F4ECE1] opacity-80 text-[13px] font-inter-medium" numberOfLines={1}>
              {dealApplied
                ? hasQualifyingItem
                  ? 'Applied -- tap to see your saving'
                  : 'Applied -- now pick one below'
                : isBundleDeal(categoryDeal)
                ? 'Tap to build your deal'
                : 'Tap to apply this deal'}
            </Text>
          </View>
          <Ionicons
            name={
              dealApplied
                ? hasQualifyingItem
                  ? 'arrow-forward-circle'
                  : 'checkmark-circle'
                : isBundleDeal(categoryDeal)
                ? 'arrow-forward'
                : 'add-circle'
            }
            size={20}
            color="#FFC72C"
          />
        </TouchableOpacity>
      )}

      {isLoading ? (
        <View className="flex-row flex-wrap px-2">
          {[1, 2, 3, 4].map((i) => (
            <View key={i} className="w-1/2 p-2">
              <SkeletonBox height={190} borderRadius={20} />
            </View>
          ))}
        </View>
      ) : error ? (
        <View className="mt-12 items-center px-6">
          <Ionicons name="alert-circle-outline" size={32} color="#A61C14" />
          <Text className="text-[#A61C14] font-inter-bold text-base mt-2 mb-1">Couldn't load items</Text>
          <Text className="text-stone-500 text-center text-[13px] mb-4">{(error as Error).message}</Text>
          <TouchableOpacity
            onPress={goBackToGrid}
            className="bg-white border border-stone-300 px-4 py-2 rounded-xl"
          >
            <Text className="text-[#1C1917] font-inter-bold text-[13px]">Return to Menu</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={items}
          numColumns={2}
          keyExtractor={(item) => item.id}
          className="flex-1 px-2"
          contentContainerStyle={{ paddingBottom: cartItems.length > 0 ? 100 : 28 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => <MenuItemGridTile item={item} isSimpleCategory={isSimpleCategory} />}
          ListHeaderComponent={
            plannerPackages.length > 0 ? (
              <CateringPlanner packages={plannerPackages} />
            ) : hasFavourites && locationId ? (
              <FanFavourites locationId={locationId} />
            ) : null
          }
          ListEmptyComponent={
            hasFavourites ? null : (
              <Text className="text-center text-stone-500 mt-10 text-sm font-inter-medium w-full">No items in this category.</Text>
            )
          }
        />
      )}
    </View>
  );
}