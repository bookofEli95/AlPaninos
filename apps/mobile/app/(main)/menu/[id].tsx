import { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Image, StyleSheet, Keyboard } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { useCartStore } from '../../../store/cartStore';
import { useAuthStore } from '../../../store/authStore';
import SkeletonBox from '../../../components/Skeleton';
import AddressAutocomplete from '../../../components/AddressAutocomplete';

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
  const incrementSimpleItemRaw = useCartStore(state => state.incrementSimpleItem);
  const decrementSimpleItemRaw = useCartStore(state => state.decrementSimpleItem);
  const incrementSimpleItem: typeof incrementSimpleItemRaw = (...args) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    incrementSimpleItemRaw(...args);
  };
  const decrementSimpleItem: typeof decrementSimpleItemRaw = (...args) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    decrementSimpleItemRaw(...args);
  };
  const cartTotal = cartItems.reduce((sum, item) => sum + item.totalPrice, 0);
  const cartQuantity = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const getSimpleQuantity = (menuItemId: string) =>
    cartItems.find(i => i.menuItemId === menuItemId && i.modifiers.length === 0)?.quantity || 0;

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

  const [activeCategory, setActiveCategory] = useState<string | null>(null);
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

  useEffect(() => {
    if (menuData?.categories?.length && !activeCategory) {
      setActiveCategory(menuData.categories[0].id);
    }
  }, [menuData]);

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    menuData?.categories?.forEach(c => map.set(c.id, c.name));
    return map;
  }, [menuData]);

  if (isLoading) {
    return (
      <View className="flex-1 bg-[#FAF6F0] pt-12 px-4">
        <SkeletonBox width={100} height={28} style={{ marginBottom: 24 }} />
        <View className="flex-row mb-6">
          <SkeletonBox width={90} height={40} borderRadius={20} style={{ marginRight: 12 }} />
          <SkeletonBox width={90} height={40} borderRadius={20} style={{ marginRight: 12 }} />
          <SkeletonBox width={90} height={40} borderRadius={20} />
        </View>
        {[1, 2, 3, 4].map(i => (
          <View key={i} className="flex-row items-center py-4 border-b border-stone-200">
            <View className="flex-1 pr-4">
              <SkeletonBox width="70%" height={18} style={{ marginBottom: 8 }} />
              <SkeletonBox width="90%" height={14} style={{ marginBottom: 8 }} />
              <SkeletonBox width={60} height={16} />
            </View>
            <SkeletonBox width={96} height={96} borderRadius={12} />
          </View>
        ))}
      </View>
    );
  }

  const isSearching = searchQuery.trim().length > 0;
  const filteredItems = isSearching
    ? (menuData?.items?.filter(item =>
        item.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
      ) || [])
    : (menuData?.items?.filter(item => item.category_id === activeCategory) || []);

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

      {/* Horizontal Category Tabs */}
      {!isSearching && (
      <View className="h-16 mb-4">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16 }}
        >
          {menuData?.categories?.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              onPress={() => setActiveCategory(cat.id)}
              className={`mr-3 px-6 py-3.5 rounded-full justify-center ${
                activeCategory === cat.id ? 'bg-[#A61C14]' : 'bg-[#E7E5E4]'
              }`}
            >
              <Text className={`font-bold text-base ${
                activeCategory === cat.id ? 'text-[#F4ECE1]' : 'text-[#78716C]'
              }`}>
                {cat.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      )}

      {/* Items List */}
      <ScrollView
        className="flex-1 px-4"
        contentContainerStyle={{ paddingBottom: cartItems.length > 0 ? 110 : 20 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {filteredItems.map(item => {
          const categoryName = categoryNameById.get(item.category_id);
          const isSimpleCategory = categoryName === 'Extras' || categoryName === 'Drinks';
          const rowContent = (
            <>
              <View className="flex-1 pr-4">
                <Text className="text-lg font-bold text-[#1C1917]">{item.name}</Text>
                {item.description && (
                  <Text className="text-[#78716C] mt-1" numberOfLines={2}>{item.description}</Text>
                )}
                <Text className="text-[#A61C14] font-bold mt-2 text-base">${item.base_price.toFixed(2)}</Text>
              </View>

              {isSimpleCategory ? (
                (() => {
                  const qty = getSimpleQuantity(item.id);
                  if (qty === 0) {
                    const addToCart = () => incrementSimpleItem(
                      { menuItemId: item.id, name: item.name, basePrice: item.base_price },
                      item.location_id
                    );
                    if (item.image_url) {
                      return (
                        <TouchableOpacity onPress={addToCart}>
                          <Image
                            source={{ uri: item.image_url }}
                            className="w-24 h-24 rounded-xl bg-stone-200"
                            resizeMode="cover"
                          />
                        </TouchableOpacity>
                      );
                    }
                    return (
                      <TouchableOpacity
                        className="bg-[#A61C14] px-4 py-2.5 rounded-xl active:bg-[#85140E]"
                        onPress={addToCart}
                      >
                        <Text className="text-[#F4ECE1] font-bold text-sm">Add to Cart</Text>
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <View className="flex-row items-center bg-stone-100 rounded-xl p-1 border border-stone-200">
                      <TouchableOpacity
                        className="bg-white w-9 h-9 rounded-lg shadow-sm items-center justify-center"
                        onPress={() => decrementSimpleItem(item.id)}
                      >
                        <Text className="text-lg font-bold text-[#1C1917]">-</Text>
                      </TouchableOpacity>
                      <Text className="px-4 text-lg font-bold text-[#1C1917]">{qty}</Text>
                      <TouchableOpacity
                        className="bg-white w-9 h-9 rounded-lg shadow-sm items-center justify-center"
                        onPress={() => incrementSimpleItem(
                          { menuItemId: item.id, name: item.name, basePrice: item.base_price },
                          item.location_id
                        )}
                      >
                        <Text className="text-lg font-bold text-[#1C1917]">+</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })()
              ) : (
                item.image_url && (
                  <Image
                    source={{ uri: item.image_url }}
                    className="w-24 h-24 rounded-xl bg-stone-200"
                    resizeMode="cover"
                  />
                )
              )}
            </>
          );

          if (isSimpleCategory) {
            return (
              <View key={item.id} className="flex-row justify-between items-center py-4 border-b border-stone-200">
                {rowContent}
              </View>
            );
          }

          return (
            <TouchableOpacity
              key={item.id}
              className="flex-row justify-between items-center py-4 border-b border-stone-200"
              onPress={() => router.push(`/(main)/item/${item.id}`)}
            >
              {rowContent}
            </TouchableOpacity>
          );
        })}

        {filteredItems.length === 0 && (
          <Text className="text-center text-[#78716C] mt-10 text-base">
            {isSearching ? `No items match "${searchQuery.trim()}".` : 'No items in this category.'}
          </Text>
        )}
      </ScrollView>

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