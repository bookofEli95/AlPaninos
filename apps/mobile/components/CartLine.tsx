import { useState } from 'react';
import { View, Text, TouchableOpacity, Image, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { CartItem } from '../store/cartStore';
import { groupRepeats } from '../lib/modifiers';
import { tabularNums } from '../lib/typography';

const RED = '#A61C14';

// One line of the cart, kept compact: photo, name, price, and a small
// - / + (a bin at 1). The item's options are one short line of text
// ("Provolone · Toasted · Extra Meat (+$3.00)") that opens up to show them
// all -- with its kitchen note -- when it's longer than fits. A free reward
// says which reward it is and has just a remove.
export default function CartLine({
  item,
  rewardTitle,
  note,
  last,
  onChangeQuantity,
}: {
  item: CartItem;
  // Set for a free reward item: "Free Signature Sandwich".
  rewardTitle?: string | null;
  // A line of context under the name (catering: "Comes with your catering order").
  note?: string | null;
  last?: boolean;
  onChangeQuantity: (quantity: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isReward = !!item.promoCode;

  const options = groupRepeats(item.modifiers, (mod) => mod.optionId)
    .map(
      ({ item: mod, count }) =>
        `${count > 1 ? `${count}× ` : ''}${mod.name}${!isReward && mod.price > 0 ? ` (+$${(mod.price * count).toFixed(2)})` : ''}`
    )
    .join(' · ');
  const instructions = item.specialInstructions?.trim() || '';
  // Worth a "More" when it won't fit on one line.
  const canExpand = options.length > 38 || instructions.length > 38 || (!!options && !!instructions);

  const change = (quantity: number) => {
    Haptics.impactAsync(quantity < item.quantity ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(
      () => {}
    );
    onChangeQuantity(quantity);
  };

  return (
    <View className={`flex-row px-3.5 py-3 ${last ? '' : 'border-b border-stone-100'}`}>
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} className="w-14 h-14 rounded-xl bg-stone-100" resizeMode="cover" />
      ) : (
        <View className="w-14 h-14 rounded-xl bg-[#FAF6F0] items-center justify-center">
          <Ionicons name="restaurant" size={20} color="#A8A29E" />
        </View>
      )}

      <View className="flex-1 ml-3 mr-2">
        <Text className="text-[15px] font-inter-bold text-[#1C1917] leading-5" numberOfLines={2}>
          {item.name}
        </Text>

        {isReward && (
          <View className="flex-row items-center mt-0.5">
            <Ionicons name="gift" size={12} color="#B45309" />
            <Text className="text-xs font-inter-bold text-[#B45309] ml-1 flex-shrink" numberOfLines={1}>
              {rewardTitle ?? 'Reward'} · on us
            </Text>
          </View>
        )}

        {!!note && (
          <Text className="text-xs font-inter-semibold text-[#A61C14] mt-0.5" numberOfLines={2}>
            {note}
          </Text>
        )}

        {(!!options || !!instructions) && (
          <Pressable onPress={() => canExpand && setExpanded((e) => !e)} disabled={!canExpand} className="mt-0.5">
            {!!options && (
              <Text className="text-[13px] text-stone-500 leading-[18px]" numberOfLines={expanded ? undefined : 1}>
                {options}
              </Text>
            )}
            {!!instructions && (expanded || !options) && (
              <Text className="text-[13px] text-stone-400 italic leading-[18px]" numberOfLines={expanded ? undefined : 1}>
                "{instructions}"
              </Text>
            )}
            {canExpand && (
              <Text className="text-xs font-inter-bold text-[#A61C14] mt-0.5">{expanded ? 'Less' : 'More'}</Text>
            )}
          </Pressable>
        )}
      </View>

      <View className="items-end justify-between">
        <Text className="text-[15px] font-inter-bold text-[#1C1917]" style={tabularNums}>
          {isReward ? 'FREE' : `$${item.totalPrice.toFixed(2)}`}
        </Text>

        {isReward ? (
          <TouchableOpacity
            onPress={() => change(0)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={`Remove ${item.name} (reward)`}
            className="w-8 h-8 rounded-full bg-stone-100 items-center justify-center mt-2"
          >
            <Ionicons name="trash-outline" size={15} color="#78716C" />
          </TouchableOpacity>
        ) : (
          <View className="flex-row items-center bg-stone-100 rounded-full mt-2" style={{ padding: 2 }}>
            <TouchableOpacity
              onPress={() => change(item.quantity - 1)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
              accessibilityLabel={item.quantity === 1 ? `Remove ${item.name}` : `One less ${item.name}`}
              className="w-7 h-7 rounded-full bg-white items-center justify-center"
            >
              <Ionicons name={item.quantity === 1 ? 'trash-outline' : 'remove'} size={14} color={item.quantity === 1 ? RED : '#1C1917'} />
            </TouchableOpacity>
            <Text className="w-7 text-center text-sm font-inter-bold text-[#1C1917]" style={tabularNums}>
              {item.quantity}
            </Text>
            <TouchableOpacity
              onPress={() => change(item.quantity + 1)}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
              accessibilityLabel={`One more ${item.name}`}
              className="w-7 h-7 rounded-full bg-white items-center justify-center"
            >
              <Ionicons name="add" size={14} color="#1C1917" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}
