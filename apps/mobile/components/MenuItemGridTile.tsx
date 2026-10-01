import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useCartStore } from '../store/cartStore';
import { servesLabel } from '../lib/catering';
import { DropFields, dropLabel, dropState } from '../lib/drops';
import { tabularNums } from '../lib/typography';

const RED = '#A61C14';

type Props = {
  item: {
    id: string;
    name: string;
    base_price: number;
    image_url: string | null;
    location_id: string;
    description?: string | null;
    // Catering packages only (see the catering migration).
    serves_min?: number | null;
    serves_max?: number | null;
  } & DropFields;
  // Extras/Drinks have no modifiers to configure -- tapping adds/adjusts a
  // quantity right on the tile instead of opening the item detail screen.
  isSimpleCategory: boolean;
  // A deal on this item's category, e.g. "25% OFF" (lib/categoryDeals).
  dealTag?: string | null;
};

// A menu item in a two-across grid: its photo (with any deal on it, and a
// round + in the corner), name, a short description and the price. Tiles
// in a row are the same height, price lined up along the bottom.
//
// Drinks and extras add straight from the grid -- a tap anywhere adds one,
// and once there's one in the cart the + becomes a - 2 + counter on the
// photo. Everything else opens its own screen (the + too) to choose its
// options.
export default function MenuItemGridTile({ item, isSimpleCategory, dealTag }: Props) {
  const router = useRouter();
  const cartItems = useCartStore((state) => state.items);
  const incrementSimpleItem = useCartStore((state) => state.incrementSimpleItem);
  const decrementSimpleItem = useCartStore((state) => state.decrementSimpleItem);

  const qty = cartItems.find((i) => i.menuItemId === item.id && i.modifiers.length === 0)?.quantity || 0;
  // A drop that hasn't started can be looked at but not added.
  const drop = dropState(item);
  const dropNote = dropLabel(item);
  const orderable = drop !== 'upcoming';
  const canQuickAdd = isSimpleCategory && orderable;
  const description = item.description?.trim();

  const addOne = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    incrementSimpleItem(
      { menuItemId: item.id, name: item.name, basePrice: item.base_price, imageUrl: item.image_url },
      item.location_id
    );
  };
  const removeOne = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    decrementSimpleItem(item.id);
  };
  const open = () => router.push(`/(main)/item/${item.id}`);

  return (
    <View className="w-1/2 p-2">
      <TouchableOpacity
        activeOpacity={canQuickAdd ? 0.85 : 0.7}
        onPress={canQuickAdd ? addOne : open}
        accessibilityLabel={canQuickAdd ? `Add ${item.name}` : item.name}
        style={styles.card}
      >
        <View>
          {item.image_url ? (
            <Image source={{ uri: item.image_url }} style={styles.photo} resizeMode="cover" />
          ) : (
            <View style={[styles.photo, { alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="restaurant" size={28} color="#A8A29E" />
            </View>
          )}

          {!!dealTag && (
            <View style={styles.dealTag}>
              <Ionicons name="pricetag" size={10} color="#7A0E0A" />
              <Text style={styles.dealTagText}>{dealTag}</Text>
            </View>
          )}

          {/* The corner control: + (adds, or opens to choose options), or a
              counter once a drink/extra is in the cart. */}
          {orderable &&
            (canQuickAdd && qty > 0 ? (
              <View style={styles.counter}>
                <TouchableOpacity
                  onPress={removeOne}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
                  accessibilityLabel={`One less ${item.name}`}
                  style={styles.counterButton}
                >
                  <Ionicons name={qty === 1 ? 'trash-outline' : 'remove'} size={14} color={qty === 1 ? RED : '#1C1917'} />
                </TouchableOpacity>
                <Text style={[styles.counterText, tabularNums]}>{qty}</Text>
                <TouchableOpacity
                  onPress={addOne}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                  accessibilityLabel={`One more ${item.name}`}
                  style={styles.counterButton}
                >
                  <Ionicons name="add" size={15} color="#1C1917" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={canQuickAdd ? addOne : open}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                accessibilityLabel={canQuickAdd ? `Add ${item.name}` : `Choose options for ${item.name}`}
                style={styles.plus}
              >
                <Ionicons name="add" size={20} color="#F4ECE1" />
              </TouchableOpacity>
            ))}
        </View>

        <View style={styles.body}>
          <Text className="text-[#1C1917] font-inter-bold text-[15px] leading-5" numberOfLines={2}>
            {item.name}
          </Text>
          {!!description && (
            <Text className="text-[#78716C] text-xs leading-4 mt-1" numberOfLines={2}>
              {description}
            </Text>
          )}

          {!!dropNote && (
            <View className="flex-row items-center mt-1.5">
              <Ionicons name="flame" size={12} color={drop === 'live' ? RED : '#78716C'} />
              <Text
                className="text-xs ml-1 font-inter-semibold flex-1"
                style={{ color: drop === 'live' ? RED : '#78716C' }}
                numberOfLines={1}
              >
                {dropNote}
              </Text>
            </View>
          )}

          {/* Pushed to the bottom, so prices line up across a row. */}
          <View style={{ flex: 1, minHeight: 6 }} />
          <View className="flex-row items-center justify-between">
            <Text className="text-[#A61C14] font-inter-extrabold text-[15px]" style={tabularNums}>
              ${item.base_price.toFixed(2)}
            </Text>
            {!!item.serves_min && (
              <View className="flex-row items-center">
                <Ionicons name="people-outline" size={12} color="#78716C" />
                <Text className="text-[#78716C] text-xs ml-1">{servesLabel(item.serves_min, item.serves_max)}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  // Fills the grid cell, so tiles in a row are the same height.
  card: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E7E5E4',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  photo: {
    width: '100%',
    height: 128,
    backgroundColor: '#F5F5F4',
  },
  body: {
    flex: 1,
    padding: 12,
  },
  dealTag: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFC72C',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },
  dealTagText: {
    marginLeft: 3,
    color: '#7A0E0A',
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 10,
    letterSpacing: 0.3,
  },
  plus: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  counter: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    padding: 3,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  counterButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F5F5F4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterText: {
    minWidth: 24,
    textAlign: 'center',
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 14,
    color: '#1C1917',
  },
});
