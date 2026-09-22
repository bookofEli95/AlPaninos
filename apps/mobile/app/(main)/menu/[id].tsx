import { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Image, StyleSheet, Keyboard } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { useCartStore } from '../../../store/cartStore';
import { useAuthStore } from '../../../store/authStore';
import SkeletonBox from '../../../components/Skeleton';
import AddressAutocomplete from '../../../components/AddressAutocomplete';
import MenuItemGridTile from '../../../components/MenuItemGridTile';

export default function MenuScreen() {
  const { id: locationId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [orderTypeModalVisible, setOrderTypeModalVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const { orderType, setOrderType, deliveryAddress, setDeliveryAddress } = useCartStore();
  const session = useAuthStore(state => state.session);
  const isAnonymous = session?.user?.is_anonymous ?? false;

  const handleSelectDelivery = async () => {
    setOrderType('delivery');
    if (deliveryAddress || isAnonymous || !session?.user?.id) return;
    const { data, error } = await (supabase as any)
      .from('profiles')
      .select('address')
      .eq('id', session.user.id)
      .single();
    if (error) {
      console.warn('Failed to load saved address:', error.message);
      return;
    }
    if (data?.address) setDeliveryAddress(data.address);
  };

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const cartItems = useCartStore(state => state.items);
  const cartTotal = cartItems.reduce((sum, item) => sum + item.totalPrice, 0);
  const cartQuantity = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const { data: activePromotions } = useQuery({
    queryKey: ['promotions', locationId],
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

  // Rows of 2 for the category grid below -- a plain flexed layout (not a
  // FlatList) so each row/tile can be told to fill an equal share of
  // whatever vertical space is actually available, instead of sizing itself
  // to fixed/intrinsic content height. With exactly 6 categories that means
  // 3 full-height rows spanning from the search bar down to the tab bar.
  const categoryRows = useMemo(() => {
    const cats = menuData?.categories || [];
    const rows: (typeof cats)[] = [];
    for (let i = 0; i < cats.length; i += 2) {
      rows.push(cats.slice(i, i + 2));
    }
    return rows;
  }, [menuData]);

  if (isLoading) {
    return (
      <View className="flex-1 bg-[#FAF6F0] pt-12 px-4">
        <SkeletonBox width={140} height={44} style={{ marginBottom: 32 }} />
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
        item.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
      ) || [])
    : [];

  return (
    <View className="flex-1 bg-[#FAF6F0] pt-12">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 mb-6">
        <Text className="text-5xl font-display-bold text-[#1C1917]">Menu</Text>

        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={() => setOrderTypeModalVisible(true)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            className="flex-row items-center bg-white border border-stone-300 rounded-full px-5 py-4 mr-3"
          >
            <Ionicons
              name={orderType === 'pickup' ? 'storefront-outline' : 'car-outline'}
              size={22}
              color="#A61C14"
            />
            <Text className="text-[#1C1917] font-inter-semibold text-base ml-2" numberOfLines={1} style={{ maxWidth: 120 }}>
              {orderType === 'pickup' ? 'Pickup' : (deliveryAddress || 'Delivery')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('/(main)/cart')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            className="bg-white border border-stone-300 rounded-full p-4"
          >
            <Ionicons name="cart-outline" size={26} color="#A61C14" />
            {cartQuantity > 0 && (
              <View
                className="absolute bg-[#A61C14] rounded-full items-center justify-center"
                style={{ top: -6, right: -6, minWidth: 22, height: 22, paddingHorizontal: 4 }}
              >
                <Text className="text-[#F4ECE1] font-inter-bold" style={{ fontSize: 12 }}>{cartQuantity}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {activePromotions && activePromotions.length > 0 && (
        <TouchableOpacity
          onPress={() => router.push('/(main)/deals')}
          className="flex-row items-center justify-between bg-[#A61C14] mx-4 mb-4 px-4 py-3 rounded-xl"
        >
          <View className="flex-row items-center flex-1 mr-2">
            <Ionicons name="pricetag" size={18} color="#F4ECE1" />
            <Text className="text-[#F4ECE1] font-inter-bold ml-2" numberOfLines={1}>
              Deals
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#F4ECE1" />
        </TouchableOpacity>
      )}

      {/* Search */}
      <View className="px-4 mb-4">
        <TextInput
          className="bg-white border border-stone-300 rounded-xl px-4 py-3 text-base text-[#1C1917]"
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
            <Text className="text-center text-[#78716C] mt-10 text-base w-full">
              No items match "{searchQuery.trim()}".
            </Text>
          }
        />
      ) : categoryRows.length === 0 ? (
        <Text className="text-center text-[#78716C] mt-10 text-base w-full">No categories yet.</Text>
      ) : (
        // A plain flexed grid rather than a FlatList -- with only a
        // handful of categories, each row/tile can be told to fill an
        // equal share of whatever vertical space is actually available
        // (search bar down to the tab bar) instead of sizing to fixed/
        // intrinsic content height the way a FlatList's rows normally do.
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
                        <Ionicons name="restaurant-outline" size={44} color="#A8A29E" />
                      </View>
                    )}
                    <View className="p-3">
                      <Text className="text-[#1C1917] font-display-bold text-lg text-center tracking-wide">
                        {cat.name.toUpperCase()}
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

      {/* Floating Cart Button */}
      {cartItems.length > 0 && (
        <View className="absolute bottom-8 left-4 right-4">
          <TouchableOpacity
            className="bg-[#A61C14] rounded-2xl p-4 flex-row justify-between items-center shadow-lg active:bg-[#85140E]"
            onPress={() => router.push('/(main)/cart')}
          >
            <View className="bg-[#85140E] rounded-full w-8 h-8 items-center justify-center">
              <Text className="text-[#F4ECE1] font-inter-bold">{cartQuantity}</Text>
            </View>
            <Text className="text-[#F4ECE1] font-inter-bold text-lg">View Cart</Text>
            <Text className="text-[#F4ECE1] font-inter-bold text-lg">${cartTotal.toFixed(2)}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Order Type Sheet -- rendered after the floating cart button so it
          paints on top of it (and its backdrop covers it) while open */}
      {orderTypeModalVisible && (
        <View
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}
        >
          <TouchableOpacity
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            activeOpacity={1}
            onPress={() => setOrderTypeModalVisible(false)}
          />
          <View style={{ marginBottom: keyboardHeight }}>
            <View className="bg-[#FAF6F0] rounded-t-3xl p-5" style={{ paddingBottom: 32 }}>
              <Text className="text-xl font-inter-extrabold text-[#1C1917] mb-4">Order Type</Text>

              <View className="flex-row bg-[#E7E5E4] p-1 rounded-xl mb-4">
                <TouchableOpacity
                  onPress={() => setOrderType('pickup')}
                  className={`flex-1 py-3 rounded-lg items-center ${orderType === 'pickup' ? 'bg-white' : ''}`}
                  style={orderType === 'pickup' ? styles.activeToggleShadow : undefined}
                >
                  <Text className={`font-inter-bold text-base ${orderType === 'pickup' ? 'text-[#A61C14]' : 'text-[#78716C]'}`}>
                    Pickup
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSelectDelivery}
                  className={`flex-1 py-3 rounded-lg items-center ${orderType === 'delivery' ? 'bg-white' : ''}`}
                  style={orderType === 'delivery' ? styles.activeToggleShadow : undefined}
                >
                  <Text className={`font-inter-bold text-base ${orderType === 'delivery' ? 'text-[#A61C14]' : 'text-[#78716C]'}`}>
                    Delivery
                  </Text>
                </TouchableOpacity>
              </View>

              {orderType === 'delivery' && (
                <View className="mb-4">
                  <Text className="text-[#1C1917] font-inter-bold mb-2">Delivering to:</Text>
                  <AddressAutocomplete
                    defaultAddress={deliveryAddress}
                    onAddressSelect={setDeliveryAddress}
                    clearOnFocus
                  />
                </View>
              )}

              <TouchableOpacity
                onPress={() => setOrderTypeModalVisible(false)}
                className="bg-[#A61C14] rounded-xl py-4 items-center active:bg-[#85140E]"
              >
                <Text className="text-[#F4ECE1] font-inter-bold text-lg">Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Applied conditionally via `style`, not `className` -- toggling shadow-*
  // (or opacity-*/color-with-alpha) utility classes on and off is a known
  // NativeWind bug that crashes with a bogus "no navigation context" error.
  // See https://github.com/nativewind/nativewind/issues/1536
  activeToggleShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
});
