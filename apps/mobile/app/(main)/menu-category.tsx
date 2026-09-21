import { useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useCartStore } from '../../store/cartStore';
import { useBackHandler } from '../../hooks/useBackHandler';
import SkeletonBox from '../../components/Skeleton';
import MenuItemGridTile from '../../components/MenuItemGridTile';

export default function MenuCategoryScreen() {
  const { categoryId, categoryName, locationId } = useLocalSearchParams<{
    categoryId: string;
    categoryName: string;
    locationId: string;
  }>();
  const router = useRouter();
  const cartItems = useCartStore(state => state.items);
  const cartTotal = cartItems.reduce((sum, item) => sum + item.totalPrice, 0);
  const cartQuantity = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const goBackToGrid = useCallback(() => {
    router.replace(`/(main)/menu/${locationId}`);
  }, [locationId]);
  useBackHandler(goBackToGrid);

  const isSimpleCategory = categoryName === 'Extras' || categoryName === 'Drinks';

  const { data: items, isLoading, error } = useQuery({
    queryKey: ['menuCategoryItems', categoryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('menu_items')
        .select('*')
        .eq('category_id', categoryId)
        .eq('is_available', true);
      if (error) throw error;
      return data;
    },
    enabled: !!categoryId,
  });

  return (
    <View className="flex-1 bg-[#FAF6F0] pt-12">
      <View className="flex-row items-center justify-between px-4 mb-4">
        <View className="flex-row items-center flex-1 mr-2">
          <TouchableOpacity
            onPress={goBackToGrid}
            className="flex-row items-center py-2 pr-4 -ml-2"
          >
            <Ionicons name="chevron-back" size={28} color="#A61C14" />
          </TouchableOpacity>
          <Text className="text-2xl font-extrabold text-[#1C1917] flex-1" numberOfLines={1}>
            {categoryName}
          </Text>
        </View>

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

      {isLoading ? (
        <View className="flex-row flex-wrap px-2">
          {[1, 2, 3, 4].map(i => (
            <View key={i} className="w-1/2 p-2">
              <SkeletonBox height={180} borderRadius={16} />
            </View>
          ))}
        </View>
      ) : error ? (
        <View className="mt-10 items-center px-6">
          <Text className="text-[#A61C14] font-bold text-lg mb-2">Couldn't load items</Text>
          <Text className="text-[#78716C] text-center">{(error as Error).message}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          numColumns={2}
          keyExtractor={(item) => item.id}
          className="flex-1 px-2"
          contentContainerStyle={{ paddingBottom: cartItems.length > 0 ? 110 : 20 }}
          renderItem={({ item }) => <MenuItemGridTile item={item} isSimpleCategory={isSimpleCategory} />}
          ListEmptyComponent={
            <Text className="text-center text-[#78716C] mt-10 text-base w-full">No items in this category.</Text>
          }
        />
      )}

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
