import { View, Text, TouchableOpacity, Image } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import { useCartStore } from '../store/cartStore';

type Suggestion = { menuItemId: string; name: string; basePrice: number; imageUrl: string | null };

// Suggested add-ons shown inline on the item page itself (below Special
// Instructions), styled the same way Extras/Drinks already work on the
// category grid (MenuItemGridTile) -- a picture, name, price, and a
// quantity stepper, no popup. Always visible while customizing the main
// item rather than surfaced only after Add to Cart.
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
    queryKey: ['upsellSuggestions', locationId, excludeCategoryName],
    queryFn: async () => {
      const { data: categories } = await supabase
        .from('menu_categories')
        .select('id, name')
        .eq('location_id', locationId)
        .in('name', ['Drinks', 'Sides']);

      const drinksCat = categories?.find((c) => c.name === 'Drinks');
      const sidesCat = categories?.find((c) => c.name === 'Sides');
      const result: Suggestion[] = [];

      if (drinksCat && excludeCategoryName !== 'Drinks') {
        const { data: drink } = await supabase
          .from('menu_items')
          .select('id, name, base_price, image_url')
          .eq('category_id', drinksCat.id)
          .eq('is_available', true)
          .limit(1)
          .maybeSingle();
        if (drink) {
          result.push({ menuItemId: drink.id, name: drink.name, basePrice: drink.base_price, imageUrl: drink.image_url });
        }
      }

      if (sidesCat && excludeCategoryName !== 'Sides') {
        const { data: fries } = await supabase
          .from('menu_items')
          .select('id, name, base_price, image_url')
          .eq('category_id', sidesCat.id)
          .eq('is_available', true)
          .ilike('name', 'Fries')
          .maybeSingle();
        if (fries) {
          result.push({ menuItemId: fries.id, name: fries.name, basePrice: fries.base_price, imageUrl: fries.image_url });
        }
      }

      return result;
    },
    enabled: !!locationId,
  });

  if (!suggestions || suggestions.length === 0) return null;

  return (
    <View className="mt-6 border-t border-stone-200 pt-4">
      <Text className="text-lg font-bold font-inter-bold text-[#1C1917] mb-2">Add to your order</Text>
      {suggestions.map((suggestion) => {
        const qty =
          items.find((i) => i.menuItemId === suggestion.menuItemId && i.modifiers.length === 0)?.quantity || 0;
        return (
          <View key={suggestion.menuItemId} className="flex-row items-center py-3 border-b border-stone-100">
            {suggestion.imageUrl ? (
              <Image source={{ uri: suggestion.imageUrl }} className="w-14 h-14 rounded-xl bg-stone-200" resizeMode="cover" />
            ) : (
              <View className="w-14 h-14 rounded-xl bg-[#FAF6F0] items-center justify-center">
                <Ionicons name="fast-food-outline" size={22} color="#A8A29E" />
              </View>
            )}
            <View className="flex-1 ml-3">
              <Text className="text-[#1C1917] font-semibold font-inter-semibold">{suggestion.name}</Text>
              <Text className="text-[#A61C14] font-bold font-inter-bold text-sm mt-0.5">${suggestion.basePrice.toFixed(2)}</Text>
            </View>
            {qty === 0 ? (
              <TouchableOpacity
                onPress={() =>
                  incrementSimpleItem(
                    { menuItemId: suggestion.menuItemId, name: suggestion.name, basePrice: suggestion.basePrice },
                    locationId
                  )
                }
                className="bg-[#A61C14] rounded-lg px-4 py-2 active:bg-[#85140E]"
              >
                <Text className="text-[#F4ECE1] font-bold font-inter-bold text-sm">Add</Text>
              </TouchableOpacity>
            ) : (
              <View className="flex-row items-center bg-stone-100 rounded-lg px-1 py-1 border border-stone-200">
                <TouchableOpacity
                  onPress={() => decrementSimpleItem(suggestion.menuItemId)}
                  className="bg-white w-8 h-8 rounded-md items-center justify-center shadow-sm"
                >
                  <Text className="font-bold font-inter-bold text-[#1C1917]">-</Text>
                </TouchableOpacity>
                <Text className="font-bold font-inter-bold text-[#1C1917] text-sm w-6 text-center">{qty}</Text>
                <TouchableOpacity
                  onPress={() =>
                    incrementSimpleItem(
                      { menuItemId: suggestion.menuItemId, name: suggestion.name, basePrice: suggestion.basePrice },
                      locationId
                    )
                  }
                  className="bg-white w-8 h-8 rounded-md items-center justify-center shadow-sm"
                >
                  <Text className="font-bold font-inter-bold text-[#1C1917]">+</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
