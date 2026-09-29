import { View, Text, TouchableOpacity, Image, ScrollView } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import { useCartStore } from '../store/cartStore';

type Suggestion = { menuItemId: string; name: string; basePrice: number; imageUrl: string | null };

// "Goes great with..." on the item page, just above the Add button: a row
// of sides and drinks with photos, each added with one tap (and a stepper
// once it's in) -- the add-on moment, while they're still deciding.
// Only things with no options to choose, so a tap is all it takes.
export default function ItemAddOns({
  locationId,
  excludeCategoryName,
}: {
  locationId: string;
  excludeCategoryName?: string;
}) {
  const items = useCartStore((state) => state.items);
  const incrementSimpleItemRaw = useCartStore((state) => state.incrementSimpleItem);
  const decrementSimpleItemRaw = useCartStore((state) => state.decrementSimpleItem);

  const incrementSimpleItem: typeof incrementSimpleItemRaw = (...args) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    incrementSimpleItemRaw(...args);
  };
  const decrementSimpleItem: typeof decrementSimpleItemRaw = (...args) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    decrementSimpleItemRaw(...args);
  };

  const { data: suggestions } = useQuery({
    queryKey: ['upsellSuggestions', locationId, excludeCategoryName, 'row'],
    queryFn: async (): Promise<Suggestion[]> => {
      const { data: categories } = await supabase
        .from('menu_categories')
        .select('id, name')
        .eq('location_id', locationId)
        .in('name', ['Sides', 'Drinks']);
      const wanted = (categories || []).filter((c) => c.name !== excludeCategoryName);
      if (!wanted.length) return [];

      const { data } = await (supabase as any)
        .from('menu_items')
        .select('id, name, base_price, image_url, category_id')
        .in(
          'category_id',
          wanted.map((c) => c.id)
        )
        .eq('is_available', true)
        .order('name');
      const ids = (data || []).map((m: any) => m.id);
      const { data: groups } = ids.length
        ? await (supabase as any).from('modifier_groups').select('menu_item_id').in('menu_item_id', ids)
        : { data: [] };
      const hasOptions = new Set((groups || []).map((g: any) => g.menu_item_id));
      const simple = (data || []).filter((m: any) => !hasOptions.has(m.id));
      // Sides first (plain Fries leading -- the classic add-on), then drinks.
      const sidesId = wanted.find((c) => c.name === 'Sides')?.id;
      simple.sort((a: any, b: any) => {
        const rank = (m: any) => (m.category_id === sidesId ? (m.name.trim().toLowerCase() === 'fries' ? 0 : 1) : 2);
        return rank(a) - rank(b);
      });
      return simple.slice(0, 8).map(
        (m: any): Suggestion => ({ menuItemId: m.id, name: m.name, basePrice: Number(m.base_price), imageUrl: m.image_url })
      );
    },
    enabled: !!locationId,
    staleTime: 10 * 60000,
  });

  if (!suggestions || suggestions.length === 0) return null;

  return (
    <View className="mt-6 border-t border-stone-200 pt-4">
      <Text className="text-lg font-display-bold text-[#1C1917] mb-3">Goes great with...</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 8 }}>
        {suggestions.map((s) => {
          const qty = items.find((i) => i.menuItemId === s.menuItemId && i.modifiers.length === 0)?.quantity || 0;
          const add = () =>
            incrementSimpleItem(
              { menuItemId: s.menuItemId, name: s.name, basePrice: s.basePrice, imageUrl: s.imageUrl },
              locationId
            );
          return (
            <View
              key={s.menuItemId}
              className={`bg-white rounded-2xl overflow-hidden border ${qty > 0 ? 'border-[#A61C14]' : 'border-stone-200'}`}
              style={{ width: 132 }}
            >
              {s.imageUrl ? (
                <Image source={{ uri: s.imageUrl }} style={{ width: 132, height: 92 }} resizeMode="cover" />
              ) : (
                <View style={{ width: 132, height: 92 }} className="bg-[#FAF6F0] items-center justify-center">
                  <Ionicons name="fast-food-outline" size={24} color="#A8A29E" />
                </View>
              )}
              <View className="p-2.5">
                <Text className="text-[#1C1917] font-inter-bold text-sm" numberOfLines={1}>
                  {s.name}
                </Text>
                <View className="flex-row items-center justify-between mt-1.5">
                  <Text className="text-stone-600 font-inter-semibold text-sm">+${s.basePrice.toFixed(2)}</Text>
                  {qty === 0 ? (
                    <TouchableOpacity
                      onPress={add}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      className="bg-[#A61C14] rounded-full w-8 h-8 items-center justify-center"
                    >
                      <Ionicons name="add" size={20} color="#F4ECE1" />
                    </TouchableOpacity>
                  ) : (
                    <View className="flex-row items-center">
                      <TouchableOpacity
                        onPress={() => decrementSimpleItem(s.menuItemId)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
                        className="bg-stone-100 rounded-full w-7 h-7 items-center justify-center"
                      >
                        <Ionicons name="remove" size={16} color="#1C1917" />
                      </TouchableOpacity>
                      <Text className="font-inter-bold text-[#1C1917] text-sm w-6 text-center">{qty}</Text>
                      <TouchableOpacity
                        onPress={add}
                        hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                        className="bg-[#A61C14] rounded-full w-7 h-7 items-center justify-center"
                      >
                        <Ionicons name="add" size={16} color="#F4ECE1" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
