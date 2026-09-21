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

  if (isLoading) {
    return (
      <View className="flex-1 bg-[#FAF6F0] pt-12 px-4">
        <SkeletonBox width={100} height={28} style={{ marginBottom: 24 }} />
        <View className="flex-row flex-wrap -mx-2">
          {[1, 2, 3, 4].map(i => (
            <View key={i} className="w-1/2 p-2">
              <SkeletonBox height={180} borderRadius={16} />
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
      <View className="flex-row items-center justify-between px-4 mb-4">
        <Text className="text-3xl font-extrabold text-[#1C1917]">Menu</Text>

        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={() => setOrderTypeModalVisible(true)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            className="flex-row items-center bg-white border border-stone-300 rounded-full px-4 py-3 mr-2"
          >
            <Ionicons
              name={orderType === 'pickup' ? 'storefront-outline' : 'bicycle-outline'}
              size={18}
              color="#A61C14"
            />
            <Text className="text-[#1C1917] font-semibold text-sm ml-2" numberOfLines={1} style={{ maxWidth: 100 }}>
              {orderType === 'pickup' ? 'Pickup' : (deliveryAddress || 'Delivery')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('/(main)/cart')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            className="bg-white border border-stone-300 rounded-full p-3"
          >
            <Ionicons name="cart-outline" size={20} color="#A61C14" />
            {cartQuantity > 0 && (
              <View
                className="absolute bg-[#A61C14] rounded-full items-center justify-center"
                style={{ top: -4, right: -4, minWidth: 18, height: 18, paddingHorizontal: 3 }}
              >
                <Text className="text-[#F4ECE1] font-bold" style={{ fontSize: 11 }}>{cartQuantity}</Text>
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
            <Text className="text-[#F4ECE1] font-bold ml-2" numberOfLines={1}>
              {activePromotions.length === 1 ? activePromotions[0].title : `${activePromotions.length} deals available`}
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
      ) : (
        <FlatList
          data={menuData?.categories || []}
          numColumns={2}
          keyExtractor={(item) => item.id}
          className="flex-1 px-2"
          contentContainerStyle={{ paddingBottom: cartItems.length > 0 ? 110 : 20 }}
          renderItem={({ item: cat }) => (
            <View className="w-1/2 p-2">
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: '/(main)/menu-category',
                    params: { categoryId: cat.id, categoryName: cat.name, locationId },
                  })
                }
                className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden"
                activeOpacity={0.7}
              >
                {cat.image_url ? (
                  <Image source={{ uri: cat.image_url }} className="w-full h-28 bg-stone-200" resizeMode="cover" />
                ) : (
                  <View className="w-full h-28 bg-[#FAF6F0] items-center justify-center">
                    <Ionicons name="restaurant-outline" size={28} color="#A8A29E" />
                  </View>
                )}
                <View className="p-3">
                  <Text className="text-[#1C1917] font-bold text-base text-center">{cat.name}</Text>
                </View>
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={
            <Text className="text-center text-[#78716C] mt-10 text-base w-full">No categories yet.</Text>
          }
        />
      )}

      {/* Floating Cart Button */}
      {cartItems.length > 0 && (
        <View className="absolute bottom-8 left-4 right-4">
          <TouchableOpacity
            className="bg-[#A61C14] rounded-2xl p-4 flex-row justify-between items-center shadow-lg active:bg-[#85140E]"
            onPress={() => router.push('/(main)/cart')}
          >
            <View className="bg-[#85140E] rounded-full w-8 h-8 items-center justify-center">
              <Text className="text-[#F4ECE1] font-bold">{cartQuantity}</Text>
            </View>
            <Text className="text-[#F4ECE1] font-bold text-lg">View Cart</Text>
            <Text className="text-[#F4ECE1] font-bold text-lg">${cartTotal.toFixed(2)}</Text>
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
              <Text className="text-xl font-extrabold text-[#1C1917] mb-4">Order Type</Text>

              <View className="flex-row bg-[#E7E5E4] p-1 rounded-xl mb-4">
                <TouchableOpacity
                  onPress={() => setOrderType('pickup')}
                  className={`flex-1 py-3 rounded-lg items-center ${orderType === 'pickup' ? 'bg-white' : ''}`}
                  style={orderType === 'pickup' ? styles.activeToggleShadow : undefined}
                >
                  <Text className={`font-bold text-base ${orderType === 'pickup' ? 'text-[#A61C14]' : 'text-[#78716C]'}`}>
                    Pickup
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSelectDelivery}
                  className={`flex-1 py-3 rounded-lg items-center ${orderType === 'delivery' ? 'bg-white' : ''}`}
                  style={orderType === 'delivery' ? styles.activeToggleShadow : undefined}
                >
                  <Text className={`font-bold text-base ${orderType === 'delivery' ? 'text-[#A61C14]' : 'text-[#78716C]'}`}>
                    Delivery
                  </Text>
                </TouchableOpacity>
              </View>

              {orderType === 'delivery' && (
                <View className="mb-4">
                  <Text className="text-[#1C1917] font-bold mb-2">Delivering to:</Text>
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
                <Text className="text-[#F4ECE1] font-bold text-lg">Done</Text>
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
