import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useCartStore } from '../store/cartStore';

type Props = {
  item: {
    id: string;
    name: string;
    base_price: number;
    image_url: string | null;
    location_id: string;
  };
  // Extras/Drinks have no modifiers to configure -- tapping adds/adjusts a
  // quantity right on the tile instead of opening the item detail screen.
  isSimpleCategory: boolean;
};

export default function MenuItemGridTile({ item, isSimpleCategory }: Props) {
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

  const qty = cartItems.find(i => i.menuItemId === item.id && i.modifiers.length === 0)?.quantity || 0;

  return (
    <View className="w-1/2 p-2">
      <TouchableOpacity
        disabled={isSimpleCategory}
        activeOpacity={isSimpleCategory ? 1 : 0.7}
        onPress={() => router.push(`/(main)/item/${item.id}`)}
        className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden"
      >
        {item.image_url ? (
          <Image source={{ uri: item.image_url }} className="w-full h-32 bg-stone-200" resizeMode="cover" />
        ) : (
          <View className="w-full h-32 bg-[#FAF6F0] items-center justify-center">
            <Ionicons name="restaurant" size={28} color="#A8A29E" />
          </View>
        )}
        <View className="p-3">
          <Text className="text-[#1C1917] font-inter-bold text-sm" numberOfLines={2}>
            {item.name}
          </Text>
          <Text className="text-[#A61C14] font-inter-bold text-sm mt-1">${item.base_price.toFixed(2)}</Text>

          {isSimpleCategory && (
            qty === 0 ? (
              <TouchableOpacity
                onPress={() =>
                  incrementSimpleItem(
                    { menuItemId: item.id, name: item.name, basePrice: item.base_price, imageUrl: item.image_url },
                    item.location_id
                  )
                }
                className="bg-[#A61C14] rounded-lg py-2 items-center mt-2 active:bg-[#85140E]"
              >
                <Text className="text-[#F4ECE1] font-inter-bold text-xs">Add</Text>
              </TouchableOpacity>
            ) : (
              <View className="flex-row items-center justify-between bg-stone-100 rounded-lg mt-2 px-1 py-1 border border-stone-200">
                <TouchableOpacity
                  onPress={() => decrementSimpleItem(item.id)}
                  className="bg-white w-7 h-7 rounded-md items-center justify-center shadow-sm"
                >
                  <Text className="font-inter-bold text-[#1C1917]">-</Text>
                </TouchableOpacity>
                <Text className="font-inter-bold text-[#1C1917] text-sm">{qty}</Text>
                <TouchableOpacity
                  onPress={() =>
                    incrementSimpleItem(
                      { menuItemId: item.id, name: item.name, basePrice: item.base_price, imageUrl: item.image_url },
                      item.location_id
                    )
                  }
                  className="bg-white w-7 h-7 rounded-md items-center justify-center shadow-sm"
                >
                  <Text className="font-inter-bold text-[#1C1917]">+</Text>
                </TouchableOpacity>
              </View>
            )
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
}
