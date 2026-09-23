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
        item.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
      ) || [])
    : [];

  return (
    <View className="flex-1 bg-[#FAF6F0] pt-12">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 mb-4">
        <Text className="text-2xl font-display-bold text-[#1C1917] tracking-tight">Menu</Text>

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

      {activePromotions && activePromotions.length > 0 && (
        <TouchableOpacity
          onPress={() => router.push('/(main)/deals')}
          className="flex-row items-center justify-between bg-[#A61C14] mx-4 mb-4 px-4 py-3 rounded-xl shadow-sm"
        >
          <View className="flex-row items-center flex-1 mr-2">
            <Ionicons name="pricetag" size={16} color="#F4ECE1" />
            <Text className="text-[#F4ECE1] font-inter-bold text-sm ml-2" numberOfLines={1}>
              Deals
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#F4ECE1" />
        </TouchableOpacity>
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

      {/* Order Type Sheet */}
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
              <Text className="text-xl font-display-bold text-[#1C1917] tracking-tight mb-4">Order Type</Text>

              <View className="flex-row bg-[#E7E5E4] p-1 rounded-xl mb-4">
                <TouchableOpacity
                  onPress={() => setOrderType('pickup')}
                  className={`flex-1 py-3 rounded-lg items-center ${orderType === 'pickup' ? 'bg-white' : ''}`}
                  style={orderType === 'pickup' ? styles.activeToggleShadow : undefined}
                >
                  <Text className={`font-inter-bold text-sm ${orderType === 'pickup' ? 'text-[#A61C14]' : 'text-[#78716C]'}`}>
                    Pickup
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSelectDelivery}
                  className={`flex-1 py-3 rounded-lg items-center ${orderType === 'delivery' ? 'bg-white' : ''}`}
                  style={orderType === 'delivery' ? styles.activeToggleShadow : undefined}
                >
                  <Text className={`font-inter-bold text-sm ${orderType === 'delivery' ? 'text-[#A61C14]' : 'text-[#78716C]'}`}>
                    Delivery
                  </Text>
                </TouchableOpacity>
              </View>

              {orderType === 'delivery' && (
                <View className="mb-4">
                  <Text className="text-[#1C1917] font-inter-bold text-sm mb-2">Delivering to:</Text>
                  <AddressAutocomplete
                    defaultAddress={deliveryAddress}
                    onAddressSelect={setDeliveryAddress}
                    clearOnFocus
                  />
                </View>
              )}

              <TouchableOpacity
                onPress={() => setOrderTypeModalVisible(false)}
                className="bg-[#A61C14] rounded-xl py-3.5 items-center active:bg-[#85140E]"
              >
                <Text className="text-[#F4ECE1] font-inter-bold text-base">Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  activeToggleShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
});