import { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../../lib/supabase';
import { useCartStore } from '../../../store/cartStore';
import SkeletonBox from '../../../components/Skeleton';

export default function MenuScreen() {
  const { id: locationId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

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
      <View className="flex-row items-center px-4 mb-4">
        <TouchableOpacity onPress={() => router.back()} className="mr-4 py-2">
          <Text className="text-[#A61C14] font-bold text-lg">← Back</Text>
        </TouchableOpacity>
        <Text className="text-3xl font-extrabold text-[#1C1917]">Menu</Text>
      </View>

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
      >
        {filteredItems.map(item => {
          const isExtras = categoryNameById.get(item.category_id) === 'Extras';
          const rowContent = (
            <>
              <View className="flex-1 pr-4">
                <Text className="text-lg font-bold text-[#1C1917]">{item.name}</Text>
                {item.description && (
                  <Text className="text-[#78716C] mt-1" numberOfLines={2}>{item.description}</Text>
                )}
                <Text className="text-[#A61C14] font-bold mt-2 text-base">${item.base_price.toFixed(2)}</Text>
              </View>

              {isExtras ? (
                (() => {
                  const qty = getSimpleQuantity(item.id);
                  if (qty === 0) {
                    return (
                      <TouchableOpacity
                        className="bg-[#A61C14] px-4 py-2.5 rounded-xl active:bg-[#85140E]"
                        onPress={() => incrementSimpleItem(
                          { menuItemId: item.id, name: item.name, basePrice: item.base_price },
                          item.location_id
                        )}
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

          if (isExtras) {
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
    </View>
  );
}