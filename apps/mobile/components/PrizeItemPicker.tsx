import { View, Text, TouchableOpacity, Image, ScrollView, StyleSheet } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { EligiblePrizeItem } from '../lib/prizeRedemption';

// Shown when a "pick a free item" prize (see lib/prizeRedemption.ts) has
// more than one eligible item -- e.g. Free Choice of Pop lists every drink,
// Free Specialty Fries lists Greek/Philly/etc. A single-match prize (Free
// Fries) skips this entirely and adds straight to the cart instead.
//
// A sheet that slides up from the bottom, like the app's other pickers
// (order type, pickup time, account setup) -- within thumb reach on tall
// phones.
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
  const insets = useSafeAreaInsets();

  return (
    <Animated.View entering={FadeIn.duration(150)} style={styles.overlay}>
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      <Animated.View
        entering={SlideInDown.duration(280)}
        className="bg-[#FAF6F0] rounded-t-3xl px-5 pt-3"
        style={{ maxHeight: '75%', paddingBottom: Math.max(insets.bottom, 16) + 8 }}
      >
        <View className="w-10 h-1 bg-stone-300 rounded-full self-center mb-3" />
        <View className="flex-row justify-between items-center mb-1">
          <Text className="text-xl font-inter-extrabold text-[#1C1917] flex-1 mr-2">{title}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={24} color="#1C1917" />
          </TouchableOpacity>
        </View>
        <Text className="text-[#78716C] mb-4">Pick one -- it's on us.</Text>

        {/* A plain ScrollView, not a FlatList: the list is short, and the
            cart shows this from inside its own scrolling screen, where a
            FlatList triggers React Native's nested-list warning. */}
        <ScrollView showsVerticalScrollIndicator={false}>
          {items.map((item) => (
            <TouchableOpacity
              key={item.id}
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
              <Text className="flex-1 ml-3 font-inter-semibold text-[#1C1917]" numberOfLines={1}>{item.name}</Text>
              <Text className="text-[#A61C14] font-inter-extrabold text-sm">FREE</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    zIndex: 100,
  },
});
