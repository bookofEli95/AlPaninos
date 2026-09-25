import { useState } from 'react';
import { View, Text, TouchableOpacity, Image, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import { useCartStore } from '../store/cartStore';
import { useFanFavourites } from '../hooks/useFanFavourites';
import { tabularNums } from '../lib/typography';

// "Fan Favourites" in the Secret Mob: the combos customers order most here,
// each one tap to add exactly as the fans have it.
export default function FanFavourites({ locationId }: { locationId: string }) {
  const { data: favourites } = useFanFavourites(locationId);
  const addItem = useCartStore((state) => state.addItem);
  const [addedKey, setAddedKey] = useState<string | null>(null);

  if (!favourites?.length) return null;

  const handleAdd = async (fav: (typeof favourites)[number], key: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    // Each option's current name and price, so the cart line matches the menu.
    const { data: options } = await (supabase as any)
      .from('modifier_options')
      .select('id, name, price_adjustment')
      .in('id', fav.option_ids);
    const byId = new Map((options || []).map((o: any) => [o.id, o]));
    const modifiers = fav.option_ids
      .map((id) => byId.get(id) as any)
      .filter(Boolean)
      .map((o) => ({ optionId: o.id, name: o.name, price: Number(o.price_adjustment) }));
    const { data: item } = await (supabase as any)
      .from('menu_items')
      .select('base_price')
      .eq('id', fav.menu_item_id)
      .single();
    const basePrice = Number(item?.base_price ?? 0);

    addItem(
      {
        cartItemId: Math.random().toString(36).substring(2, 9),
        menuItemId: fav.menu_item_id,
        name: fav.name,
        basePrice,
        quantity: 1,
        modifiers,
        totalPrice: basePrice + modifiers.reduce((sum, m) => sum + m.price, 0),
        imageUrl: fav.image_url,
      },
      locationId
    );
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setAddedKey(key);
    setTimeout(() => setAddedKey((current) => (current === key ? null : current)), 1500);
  };

  return (
    <View className="mb-4 px-2">
      <View className="flex-row items-center mb-0.5">
        <Ionicons name="heart" size={15} color="#A61C14" />
        <Text className="text-base font-inter-bold text-[#1C1917] ml-1.5">Fan Favourites</Text>
      </View>
      <Text className="text-xs text-stone-500 mb-2.5">How our regulars order them -- add it exactly their way.</Text>
      <FlatList
        horizontal
        data={favourites}
        keyExtractor={(fav) => `${fav.menu_item_id}:${fav.option_ids.join(',')}`}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item: fav }) => {
          const key = `${fav.menu_item_id}:${fav.option_ids.join(',')}`;
          const added = addedKey === key;
          return (
            <View className="bg-white rounded-2xl border border-stone-200 mr-2.5 overflow-hidden" style={{ width: 168 }}>
              {fav.image_url ? (
                <Image source={{ uri: fav.image_url }} className="w-full h-20 bg-stone-200" resizeMode="cover" />
              ) : (
                <View className="w-full h-20 bg-[#FAF6F0] items-center justify-center">
                  <Ionicons name="restaurant" size={22} color="#A8A29E" />
                </View>
              )}
              <View className="p-2.5 flex-1">
                <Text className="text-sm font-inter-bold text-[#1C1917]" numberOfLines={1}>
                  {fav.name}
                </Text>
                <Text className="text-[11px] text-stone-600 leading-4 mt-0.5" numberOfLines={2}>
                  + {fav.option_names.join(', ')}
                </Text>
                <Text className="text-[10px] text-stone-400 mt-1">Ordered {fav.times_ordered} times</Text>
                <View className="flex-row items-center justify-between mt-2">
                  <Text className="text-sm font-inter-bold text-[#A61C14]" style={tabularNums}>
                    ${Number(fav.price).toFixed(2)}
                  </Text>
                  <TouchableOpacity
                    onPress={() => handleAdd(fav, key)}
                    disabled={added}
                    className={`px-3 h-7 rounded-lg items-center justify-center ${added ? 'bg-emerald-600' : 'bg-[#A61C14] active:bg-[#85140E]'}`}
                  >
                    {added ? (
                      <Ionicons name="checkmark" size={14} color="#F4ECE1" />
                    ) : (
                      <Text className="text-[#F4ECE1] font-inter-bold text-xs">Add</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}
