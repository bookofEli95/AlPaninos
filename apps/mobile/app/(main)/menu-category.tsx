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
      return data;
    },
    enabled: !!categoryId,
  });

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
              <Text className="text-xs text-stone-500 font-inter-medium">
                {items.length} {items.length === 1 ? 'item' : 'items'} • {items.some((i: any) => i.is_catering) ? 'Order by 6 PM for tomorrow' : 'Made fresh'}
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
              <Text className="text-[#F4ECE1] font-inter-bold text-[10px] leading-3">
                {cartQuantity}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

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
          <Text className="text-stone-500 text-center text-xs mb-4">{(error as Error).message}</Text>
          <TouchableOpacity
            onPress={goBackToGrid}
            className="bg-white border border-stone-300 px-4 py-2 rounded-xl"
          >
            <Text className="text-[#1C1917] font-inter-bold text-xs">Return to Menu</Text>
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
          ListHeaderComponent={plannerPackages.length > 0 ? <CateringPlanner packages={plannerPackages} /> : null}
          ListEmptyComponent={
            <Text className="text-center text-stone-500 mt-10 text-sm font-inter-medium w-full">No items in this category.</Text>
          }
        />
      )}
    </View>
  );
}