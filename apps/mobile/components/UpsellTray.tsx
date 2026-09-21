import { useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import { useCartStore } from '../store/cartStore';

type Suggestion = { menuItemId: string; name: string; basePrice: number };

const AUTO_DISMISS_MS = 6000;

// Shown right after Add to Cart -- the moment of highest motivation/ability
// (the decision is already made) is the cheapest point to offer one more
// small addition. Deliberately not a blocking modal: this sits inline and
// auto-dismisses, since interrupting a just-completed action reads as
// friction rather than a suggestion. One tap adds and closes -- this is a
// nudge, not a second cart to build.
export default function UpsellTray({
  locationId,
  excludeCategoryName,
  onDismiss,
}: {
  locationId: string;
  excludeCategoryName?: string;
  onDismiss: () => void;
}) {
  const items = useCartStore((state) => state.items);
  const incrementSimpleItem = useCartStore((state) => state.incrementSimpleItem);

  const { data: suggestions, isLoading } = useQuery({
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
          .select('id, name, base_price')
          .eq('category_id', drinksCat.id)
          .eq('is_available', true)
          .limit(1)
          .maybeSingle();
        if (drink) result.push({ menuItemId: drink.id, name: drink.name, basePrice: drink.base_price });
      }

      if (sidesCat && excludeCategoryName !== 'Sides') {
        const { data: fries } = await supabase
          .from('menu_items')
          .select('id, name, base_price')
          .eq('category_id', sidesCat.id)
          .eq('is_available', true)
          .ilike('name', 'Fries')
          .maybeSingle();
        if (fries) result.push({ menuItemId: fries.id, name: fries.name, basePrice: fries.base_price });
      }

      return result;
    },
    enabled: !!locationId,
  });

  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, []);

  // Already in the cart (as a no-modifier line, same shape incrementSimpleItem
  // manages) -- don't suggest adding a second one.
  const visibleSuggestions = (suggestions || []).filter(
    (s) => !items.some((i) => i.menuItemId === s.menuItemId && i.modifiers.length === 0)
  );

  useEffect(() => {
    if (!isLoading && visibleSuggestions.length === 0) onDismiss();
  }, [isLoading, visibleSuggestions.length]);

  if (isLoading || visibleSuggestions.length === 0) return null;

  const handleAdd = (suggestion: Suggestion) => {
    incrementSimpleItem(suggestion, locationId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onDismiss();
  };

  return (
    <View
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
      className="bg-white border-t border-stone-200 px-4 pt-4 pb-6 shadow-xl"
    >
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-base font-extrabold text-[#1C1917]">Complete your order?</Text>
        <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={20} color="#78716C" />
        </TouchableOpacity>
      </View>
      {visibleSuggestions.map((suggestion) => (
        <TouchableOpacity
          key={suggestion.menuItemId}
          onPress={() => handleAdd(suggestion)}
          className="flex-row items-center justify-between bg-[#FAF6F0] border border-stone-200 rounded-xl px-4 py-3 mb-2"
        >
          <Text className="text-[#1C1917] font-semibold">Add {suggestion.name}</Text>
          <View className="flex-row items-center">
            <Text className="text-[#A61C14] font-bold mr-2">+${suggestion.basePrice.toFixed(2)}</Text>
            <Ionicons name="add-circle" size={22} color="#A61C14" />
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}
