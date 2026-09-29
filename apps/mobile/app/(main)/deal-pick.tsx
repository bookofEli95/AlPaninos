import { useCallback, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, Image, ScrollView, Dimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useLocationStore } from '../../store/locationStore';
import { useDealBuilderStore } from '../../store/dealBuilderStore';
import { useBackHandler } from '../../hooks/useBackHandler';
import { isDropOrderable } from '../../lib/drops';
import { dealValue } from '../../components/DealCard';
import SkeletonBox from '../../components/Skeleton';

// Picking one meal for a Mix & Match deal: the deal's own menu -- only the
// categories it covers (e.g. The Mob and Al's Wraps), nothing else to get
// lost in. Tapping a dish opens it in "Confirm Meal 2" mode, which puts it
// in the deal (not the cart) and comes back to the Deals tab.

const TILE = (Dimensions.get('window').width - 16 * 2 - 12) / 2;

export default function DealPickScreen() {
  const { slot } = useLocalSearchParams<{ slot: string }>();
  const slotIndex = Number(slot) || 0;
  const router = useRouter();
  const locationId = useLocationStore((state) => state.locationId);
  const promo = useDealBuilderStore((state) => state.promo);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const backToDeal = useCallback(() => router.replace('/(main)/deals'), [router]);
  useBackHandler(backToDeal);

  const scopeNames = useMemo(
    () =>
      [...(promo?.category_names ?? []), promo?.category_name]
        .filter(Boolean)
        .map((n: string) => n.trim().toLowerCase()),
    [promo]
  );

  const { data, isLoading } = useQuery({
    queryKey: ['dealPick', promo?.id, locationId],
    queryFn: async () => {
      const { data: categories, error: catError } = await (supabase as any)
        .from('menu_categories')
        .select('id, name, sort_order')
        .eq('location_id', locationId)
        .order('sort_order');
      if (catError) throw catError;
      const inScope = (categories || []).filter(
        (c: any) => c.id === promo?.category_id || scopeNames.includes(String(c.name).trim().toLowerCase())
      );
      if (!inScope.length) return { categories: [], items: [] };

      const { data: items, error: itemError } = await (supabase as any)
        .from('menu_items')
        .select('*')
        .in(
          'category_id',
          inScope.map((c: any) => c.id)
        )
        .eq('is_available', true)
        .order('name');
      if (itemError) throw itemError;
      const patterns = (promo?.item_name_patterns ?? []).map((p: string) => p.trim().toLowerCase());
      const usable = (items || []).filter(
        (i: any) =>
          !i.is_catering &&
          isDropOrderable(i) &&
          (!patterns.length || patterns.includes(String(i.name).trim().toLowerCase()))
      );
      return { categories: inScope, items: usable };
    },
    enabled: !!promo && !!locationId,
  });

  const shown = useMemo(
    () => (data?.items ?? []).filter((i: any) => !activeCategory || i.category_id === activeCategory),
    [data, activeCategory]
  );

  if (!promo) {
    return (
      <View className="flex-1 bg-[#FAF6F0] items-center justify-center px-8">
        <Text className="text-[#1C1917] font-inter-bold text-base mb-4 text-center">This deal isn't open anymore.</Text>
        <TouchableOpacity onPress={backToDeal} className="bg-[#A61C14] px-6 py-3 rounded-xl">
          <Text className="text-[#F4ECE1] font-inter-bold">Back to Deals</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const value = dealValue(promo);

  return (
    <View className="flex-1 bg-[#FAF6F0] pt-14">
      <View className="px-4 mb-3">
        <TouchableOpacity onPress={backToDeal} className="flex-row items-center py-2 pr-6 -ml-2 self-start">
          <Ionicons name="chevron-back" size={26} color="#A61C14" />
          <Text className="text-[#A61C14] font-inter-bold text-base">Back to Deal</Text>
        </TouchableOpacity>
        <Text className="text-3xl font-display-bold text-[#1C1917] mt-1">Choose Meal {slotIndex + 1}</Text>
        <View className="flex-row items-center mt-1.5">
          <View className="bg-[#A61C14] rounded-full px-2.5 py-1 mr-2">
            <Text className="text-[#FFC72C] font-inter-extrabold text-xs">
              {value.big} {value.small}
            </Text>
          </View>
          <Text className="text-stone-600 text-sm font-inter-medium flex-1" numberOfLines={1}>
            {promo.title}
          </Text>
        </View>
      </View>

      {/* The deal's categories, e.g. All / The Mob / Al's Wraps */}
      {(data?.categories?.length ?? 0) > 1 && (
        <View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 12 }}
          >
            {[{ id: null, name: 'All' }, ...(data?.categories ?? [])].map((c: any) => {
              const active = activeCategory === c.id;
              return (
                <TouchableOpacity
                  key={c.id ?? 'all'}
                  onPress={() => setActiveCategory(c.id)}
                  className={`px-4 py-2 rounded-full border ${
                    active ? 'bg-[#A61C14] border-[#A61C14]' : 'bg-white border-stone-300'
                  }`}
                >
                  <Text className={`font-inter-bold text-sm ${active ? 'text-[#F4ECE1]' : 'text-[#1C1917]'}`}>
                    {c.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {isLoading ? (
        <View className="flex-row flex-wrap px-4" style={{ gap: 12 }}>
          {[0, 1, 2, 3].map((i) => (
            <SkeletonBox key={i} width={TILE} height={TILE + 56} borderRadius={18} />
          ))}
        </View>
      ) : (
        <FlatList
          data={shown}
          numColumns={2}
          keyExtractor={(item: any) => item.id}
          columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}
          contentContainerStyle={{ gap: 12, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }: { item: any }) => (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() =>
                router.push({ pathname: `/(main)/item/${item.id}`, params: { dealSlot: String(slotIndex) } })
              }
              className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm"
              style={{ width: TILE }}
            >
              {item.image_url ? (
                <Image source={{ uri: item.image_url }} style={{ width: TILE, height: TILE * 0.8 }} resizeMode="cover" />
              ) : (
                <View style={{ width: TILE, height: TILE * 0.8 }} className="bg-[#FAF6F0] items-center justify-center">
                  <Ionicons name="restaurant-outline" size={30} color="#A8A29E" />
                </View>
              )}
              <View className="p-3">
                <Text className="text-[#1C1917] font-inter-bold text-sm leading-5" numberOfLines={2}>
                  {item.name}
                </Text>
                <View className="flex-row items-center justify-between mt-1.5">
                  <Text className="text-stone-600 font-inter-semibold text-sm">
                    ${Number(item.base_price).toFixed(2)}
                  </Text>
                  <View className="bg-[#A61C14] rounded-full w-7 h-7 items-center justify-center">
                    <Ionicons name="add" size={18} color="#F4ECE1" />
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text className="text-center text-stone-500 mt-10 text-sm font-inter-medium px-8">
              Nothing for this deal is available at this store right now.
            </Text>
          }
        />
      )}
    </View>
  );
}
