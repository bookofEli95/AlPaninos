import { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { useCartStore } from '../../../store/cartStore';
import { useAuthStore } from '../../../store/authStore';
import SkeletonBox from '../../../components/Skeleton';
import OrderTypeSheet from '../../../components/OrderTypeSheet';
import MenuItemGridTile from '../../../components/MenuItemGridTile';
import { dropLabel, dropState, isDropOrderable, isDropVisible } from '../../../lib/drops';
import { useFanFavourites } from '../../../hooks/useFanFavourites';

export default function MenuScreen() {
  const { id: locationId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [orderTypeModalVisible, setOrderTypeModalVisible] = useState(false);
  const { orderType, deliveryAddress } = useCartStore();
  const session = useAuthStore(state => state.session);



  const cartItems = useCartStore(state => state.items);
  const cartQuantity = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  // Keyed by user too: personal promos (wheel/points prizes) are only
  // visible to their owner, so one account's result must never be reused for
  // another after switching accounts on the same phone.
  const { data: activePromotions } = useQuery({
    queryKey: ['promotions', locationId, session?.user?.id],
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

  const [searchQuery, setSearchQuery] = useState('');

  const { data: menuData, isLoading } = useQuery({
    queryKey: ['menu', locationId],
    queryFn: async () => {
      const [catRes, itemRes] = await Promise.all([
        supabase.from('menu_categories').select('*').eq('location_id', locationId).order('sort_order'),
        supabase.from('menu_items').select('*').eq('location_id', locationId).eq('is_available', true)
      ]);

      if (catRes.error) throw catRes.error;
      if (itemRes.error) throw itemRes.error;

      return { categories: catRes.data, items: itemRes.data };
    }
  });

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    menuData?.categories?.forEach(c => map.set(c.id, c.name));
    return map;
  }, [menuData]);

  const isSimpleCategoryName = (name?: string) => name === 'Extras' || name === 'Drinks';

  // Catering lives behind its own banner rather than a grid tile -- the
  // grid sizes its tiles to fill the screen, so a 7th category would squeeze
  // every everyday tile to make room for an occasional one.
  const cateringCategory = useMemo(
    () => (menuData?.categories || []).find((c: any) => c.is_catering) ?? null,
    [menuData]
  );

  // The app-only Secret Mob gets its own banner too, and only while it has
  // something to show (drops that have ended drop off).
  const secretCategory = useMemo(
    () => (menuData?.categories || []).find((c: any) => c.is_secret) ?? null,
    [menuData]
  );
  const secretItems = useMemo(
    () =>
      secretCategory
        ? (menuData?.items || []).filter((i: any) => i.category_id === secretCategory.id && isDropVisible(i))
        : [],
    [menuData, secretCategory]
  );
  const secretHighlight = useMemo(
    () =>
      secretItems.find((i: any) => dropState(i) === 'live') ??
      secretItems.find((i: any) => dropState(i) === 'upcoming') ??
      null,
    [secretItems]
  );

  const hasDeals = !!activePromotions && activePromotions.length > 0;
  // The Secret Mob shows when it has drops/items -- or Fan Favourites.
  const { data: fanFavourites } = useFanFavourites(secretCategory ? locationId : null);
  const showSecret = !!secretCategory && (secretItems.length > 0 || !!fanFavourites?.length);

  const categoryRows = useMemo(() => {
    const cats = (menuData?.categories || []).filter((c: any) => !c.is_catering && !c.is_secret);
    const rows: (typeof cats)[] = [];
    for (let i = 0; i < cats.length; i += 2) {
      rows.push(cats.slice(i, i + 2));
    }
    return rows;
  }, [menuData]);

  if (isLoading) {
    return (
      <View className="flex-1 bg-[#FAF6F0] pt-12 px-4">
        <SkeletonBox width={140} height={32} style={{ marginBottom: 24 }} />
        <View className="flex-1 -mx-2">
          {[0, 1, 2].map(row => (
            <View key={row} className="flex-1 flex-row">
              {[0, 1].map(col => (
                <View key={col} className="flex-1 p-2">
                  <View className="flex-1 rounded-[20px] bg-stone-200" />
                </View>
              ))}
            </View>
          ))}
        </View>
      </View>
    );
  }

  const isSearching = searchQuery.trim().length > 0;
  const searchResults = isSearching
    ? (menuData?.items?.filter(item =>
        item.name.toLowerCase().includes(searchQuery.trim().toLowerCase()) && isDropOrderable(item as any)
      ) || [])
    : [];

  return (
    <View className="flex-1 bg-[#FAF6F0] pt-12">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 mb-4">
        <Text className="text-2xl font-display-bold text-[#1C1917] tracking-tight mt-2 ml-1.5">Menu</Text>

        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={() => setOrderTypeModalVisible(true)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            className="flex-row items-center bg-white border border-stone-300 rounded-full px-4 py-2.5 mr-2.5 shadow-sm"
          >
            <Ionicons
              name={orderType === 'pickup' ? 'storefront-outline' : 'car-outline'}
              size={18}
              color="#A61C14"
            />
            <Text className="text-[#1C1917] font-inter-semibold text-sm ml-2" numberOfLines={1} style={{ maxWidth: 120 }}>
              {orderType === 'pickup' ? 'Pickup' : (deliveryAddress || 'Delivery')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('/(main)/cart')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            className="bg-white border border-stone-300 rounded-full p-2.5 shadow-sm relative"
          >
            <Ionicons name="cart-outline" size={22} color="#A61C14" />
            {cartQuantity > 0 && (
              <View
                className="absolute bg-[#A61C14] rounded-full items-center justify-center border-2 border-white"
                style={{ top: -4, right: -4, minWidth: 20, height: 20, paddingHorizontal: 4 }}
              >
                <Text className="text-[#F4ECE1] font-inter-bold text-[11px] leading-3">{cartQuantity}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Deals, Catering and the Secret Mob as one row of small tiles --
          three stacked full-width banners pushed the category grid half
          off the screen. Each tile only appears when it has something. */}
      {(hasDeals || !!cateringCategory || showSecret) && (
        <View className="flex-row mx-4 mb-4 gap-2">
          {hasDeals && (
            <TouchableOpacity
              onPress={() => router.push('/(main)/deals')}
              className="flex-1 bg-[#A61C14] rounded-xl px-3 py-2.5 shadow-sm"
              activeOpacity={0.85}
            >
              <View className="flex-row items-center">
                <Ionicons name="pricetag" size={14} color="#F4ECE1" />
                <Text className="text-[#F4ECE1] font-inter-bold text-sm ml-1.5" numberOfLines={1}>Deals</Text>
              </View>
              <Text className="text-[#F4ECE1] opacity-80 text-[11px] mt-0.5" numberOfLines={1}>
                {activePromotions!.length} {activePromotions!.length === 1 ? 'offer' : 'offers'}
              </Text>
            </TouchableOpacity>
          )}

          {cateringCategory && (
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: '/(main)/menu-category',
                  params: { categoryId: cateringCategory.id, categoryName: cateringCategory.name, locationId },
                })
              }
              className="flex-1 bg-white border border-[#A61C14] rounded-xl px-3 py-2.5 shadow-sm"
              activeOpacity={0.85}
            >
              <View className="flex-row items-center">
                <Ionicons name="people" size={14} color="#A61C14" />
                <Text className="text-[#1C1917] font-inter-bold text-sm ml-1.5" numberOfLines={1}>Catering</Text>
              </View>
              <Text className="text-[#78716C] text-[11px] mt-0.5" numberOfLines={1}>
                Order by 6 PM
              </Text>
            </TouchableOpacity>
          )}

          {showSecret && (
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: '/(main)/menu-category',
                  params: { categoryId: secretCategory!.id, categoryName: secretCategory!.name, locationId },
                })
              }
              className="flex-1 bg-[#1C1917] rounded-xl px-3 py-2.5"
              activeOpacity={0.85}
            >
              <View className="flex-row items-center">
                <Ionicons name="flame" size={14} color="#F0B4AC" />
                <Text className="text-[#F4ECE1] font-inter-bold text-sm ml-1.5" numberOfLines={1}>Secret Mob</Text>
              </View>
              <Text
                className={`text-[11px] mt-0.5 ${secretHighlight && dropState(secretHighlight as any) === 'live' ? 'text-[#F0B4AC] font-inter-semibold' : 'text-stone-400'}`}
                numberOfLines={1}
              >
                {secretHighlight
                  ? dropState(secretHighlight as any) === 'live'
                    ? 'Drop live now'
                    : dropLabel(secretHighlight as any)
                  : fanFavourites?.length
                  ? 'Fan favourites'
                  : 'App only'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Search */}
      <View className="px-4 mb-4">
        <TextInput
          className="bg-white border border-stone-300 rounded-xl px-4 py-2.5 text-sm text-[#1C1917]"
          placeholder="Search the menu..."
          placeholderTextColor="#A8A29E"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {isSearching ? (
        <FlatList
          data={searchResults}
          numColumns={2}
          keyExtractor={(item) => item.id}
          className="flex-1 px-2"
          contentContainerStyle={{ paddingBottom: cartItems.length > 0 ? 110 : 20 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          renderItem={({ item }) => (
            <MenuItemGridTile item={item} isSimpleCategory={isSimpleCategoryName(categoryNameById.get(item.category_id))} />
          )}
          ListEmptyComponent={
            <Text className="text-center text-[#78716C] mt-10 text-sm w-full font-inter-medium">
              No items match "{searchQuery.trim()}".
            </Text>
          }
        />
      ) : categoryRows.length === 0 ? (
        <Text className="text-center text-[#78716C] mt-10 text-sm w-full font-inter-medium">No categories yet.</Text>
      ) : (
        <View
          className="flex-1 px-2"
          style={{ paddingBottom: cartItems.length > 0 ? 100 : 12 }}
        >
          {categoryRows.map((row, rowIndex) => (
            <View key={rowIndex} className="flex-1 flex-row">
              {row.map((cat) => (
                <View key={cat.id} className="flex-1 p-2">
                  <TouchableOpacity
                    onPress={() =>
                      router.push({
                        pathname: '/(main)/menu-category',
                        params: { categoryId: cat.id, categoryName: cat.name, locationId },
                      })
                    }
                    className="flex-1 bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden"
                    activeOpacity={0.7}
                  >
                    {cat.image_url ? (
                      <Image source={{ uri: cat.image_url }} className="w-full flex-1 bg-stone-200" resizeMode="cover" />
                    ) : (
                      <View className="w-full flex-1 bg-[#FAF6F0] items-center justify-center">
                        <Ionicons name="restaurant-outline" size={36} color="#A8A29E" />
                      </View>
                    )}
                    <View className="p-2.5">
                      <Text className="text-[#1C1917] font-display-bold text-base text-center tracking-tight">
                        {cat.name}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              ))}
              {row.length === 1 && <View className="flex-1 p-2" />}
            </View>
          ))}
        </View>
      )}

      <OrderTypeSheet
        visible={orderTypeModalVisible}
        onClose={() => setOrderTypeModalVisible(false)}
        onStoreChanged={(newLocationId) => router.replace(`/(main)/menu/${newLocationId}`)}
      />
    </View>
  );
}
