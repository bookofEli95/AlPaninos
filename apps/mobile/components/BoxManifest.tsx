import { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DietaryTags from './DietaryTags';
import { groupRepeats } from '../lib/modifiers';
import { DIETARY_DISCLAIMER } from '../lib/dietary';

type Props = {
  orderItems: any[];
  // menu_items.id -> dietary_tags, for options that are menu items.
  tagsById: Map<string, string[]>;
};

// Tap-to-expand list of what's in each catering box -- Box 1, Box 2... in
// the order the kitchen packs and labels them -- so whoever's hosting can
// tell the group what's where.
export default function BoxManifest({ orderItems, tagsById }: Props) {
  const [open, setOpen] = useState(false);
  const cateringItems = orderItems.filter((item) => item.menu_items?.is_catering);
  if (cateringItems.length === 0) return null;

  let nextBox = 1;
  const boxes = cateringItems.map((item) => {
    const first = nextBox;
    nextBox += Math.max(1, item.quantity);
    return { item, first, last: nextBox - 1 };
  });

  return (
    <View className="bg-white border border-stone-200 rounded-3xl mb-4 shadow-sm">
      <TouchableOpacity
        onPress={() => setOpen((v) => !v)}
        className="flex-row items-center justify-between p-4"
        activeOpacity={0.8}
      >
        <View className="flex-row items-center flex-1 mr-2">
          <Ionicons name="cube-outline" size={18} color="#A61C14" />
          <View className="ml-2 flex-1">
            <Text className="text-base font-inter-bold text-[#1C1917]">What's in Each Box</Text>
            <Text className="text-xs text-[#78716C]">
              {nextBox - 1} {nextBox - 1 === 1 ? 'box' : 'boxes'}, labeled to match
            </Text>
          </View>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color="#78716C" />
      </TouchableOpacity>

      {open && (
        <View className="px-4 pb-4">
          {boxes.map(({ item, first, last }) => {
            // Each of the item's option groups in menu order, with its picks.
            const byGroup = new Map<string, { group: any; mods: any[] }>();
            (item.order_item_modifiers || []).forEach((mod: any) => {
              const group = mod.modifier_options?.modifier_groups;
              const key = group?.id ?? 'other';
              if (!byGroup.has(key)) byGroup.set(key, { group, mods: [] });
              byGroup.get(key)!.mods.push(mod);
            });
            const groups = Array.from(byGroup.values()).sort(
              (a, b) => (a.group?.sort_order ?? 0) - (b.group?.sort_order ?? 0)
            );

            return (
              <View key={item.id} className="border-t border-stone-100 pt-3 mt-1 mb-2">
                <Text className="text-[11px] font-inter-extrabold uppercase tracking-wider text-[#A61C14]">
                  {first === last ? `Box ${first}` : `Boxes ${first}-${last} (${last - first + 1} identical)`}
                </Text>
                <Text className="text-sm font-inter-bold text-[#1C1917] mb-1.5">{item.menu_items?.name}</Text>

                {groups.map(({ group, mods }) => {
                  const picks = groupRepeats(mods, (m: any) => m.modifier_options?.id ?? m.modifier_options?.name ?? '');
                  if (group?.allow_quantity) {
                    return (
                      <View key={group?.id ?? 'other'} className="mb-1">
                        {picks.map(({ item: mod, count }) => (
                          <View key={mod.modifier_options?.id ?? mod.modifier_options?.name} className="flex-row items-start py-1">
                            <Text className="text-sm font-inter-bold text-[#1C1917] w-8">{count}×</Text>
                            <View className="flex-1">
                              <Text className="text-sm text-[#1C1917]">{mod.modifier_options?.name}</Text>
                              <DietaryTags tags={tagsById.get(mod.modifier_options?.menu_item_id)} />
                            </View>
                          </View>
                        ))}
                      </View>
                    );
                  }
                  return (
                    <Text key={group?.id ?? 'other'} className="text-xs text-[#57534E] mb-1">
                      <Text className="font-inter-bold">{group?.name ?? 'Options'}: </Text>
                      {picks.map(({ item: mod, count }) => `${count > 1 ? `${count}× ` : ''}${mod.modifier_options?.name}`).join(', ')}
                    </Text>
                  );
                })}

                {!!item.special_instructions && (
                  <Text className="text-xs text-[#78716C] italic">Note: {item.special_instructions}</Text>
                )}
              </View>
            );
          })}
          <Text className="text-[11px] text-[#78716C] mt-1">{DIETARY_DISCLAIMER}</Text>
        </View>
      )}
    </View>
  );
}
