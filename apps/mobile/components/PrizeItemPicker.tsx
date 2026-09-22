import { View, Text, TouchableOpacity, Image, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EligiblePrizeItem } from '../lib/prizeRedemption';

// Shown when a "pick a free item" prize (see lib/prizeRedemption.ts) has
// more than one eligible item -- e.g. Free Choice of Pop lists every drink,
// Free Specialty Fries lists Greek/Philly/etc. A single-match prize (Free
// Fries) skips this entirely and adds straight to the cart instead.
export default function PrizeItemPicker({
  title,
  items,
  onSelect,
  onClose,
}: {
  title: string;
  items: EligiblePrizeItem[];
  onSelect: (item: EligiblePrizeItem) => void;
  onClose: () => void;
}) {
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <TouchableOpacity
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        activeOpacity={1}
        onPress={onClose}
      />
      <View className="bg-[#FAF6F0] rounded-2xl mx-4 p-5" style={{ marginTop: 90, maxHeight: '75%' }}>
        <View className="flex-row justify-between items-center mb-1">
          <Text className="text-xl font-extrabold font-inter-extrabold text-[#1C1917] flex-1 mr-2">{title}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={24} color="#1C1917" />
          </TouchableOpacity>
        </View>
        <Text className="text-[#78716C] mb-4">Pick one -- it's on us.</Text>

        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => onSelect(item)}
              className="flex-row items-center bg-white border border-stone-200 rounded-xl p-3 mb-2"
            >
              {item.image_url ? (
                <Image source={{ uri: item.image_url }} className="w-12 h-12 rounded-lg bg-stone-200" resizeMode="cover" />
              ) : (
                <View className="w-12 h-12 rounded-lg bg-[#FAF6F0] items-center justify-center">
                  <Ionicons name="fast-food-outline" size={20} color="#A8A29E" />
                </View>
              )}
              <Text className="flex-1 ml-3 font-semibold font-inter-semibold text-[#1C1917]" numberOfLines={1}>{item.name}</Text>
              <Text className="text-[#A61C14] font-extrabold font-inter-extrabold text-sm">FREE</Text>
            </TouchableOpacity>
          )}
        />
      </View>
    </View>
  );
}
