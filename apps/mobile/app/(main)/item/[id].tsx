import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Image, Keyboard } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../../lib/supabase';
import { useCartStore } from '../../../store/cartStore';
import { useBackHandler } from '../../../hooks/useBackHandler';
import { Ionicons } from '@expo/vector-icons';
import SkeletonBox from '../../../components/Skeleton';
import ItemAddOns from '../../../components/ItemAddOns';
import { optionsConflict } from '../../../lib/modifierConflicts';

export default function ItemDetailScreen() {
  // promoCode/promoTitle are only present when this item was opened from a
  // wheel-prize/PaninoPoints redemption (see deals.tsx/profile.tsx's
  // giveFreeItem) -- their presence is what makes this whole item, including
  // any modifiers picked below, free. Nothing is "applied" anywhere else
  // until Add to Cart actually runs (see handleAddToCart), so backing out of
  // this screen without finishing leaves no stray applied state behind.
  const { id: itemId, promoCode, promoTitle, returnTo } = useLocalSearchParams<{ id: string; promoCode?: string; promoTitle?: string; returnTo?: string }>();
  const router = useRouter();
  const addItem = useCartStore(state => state.addItem);

  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [quantity, setQuantity] = useState(1);
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [justAdded, setJustAdded] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ['item', itemId],
    queryFn: async () => {
      // 1. Fetch Item
      const { data: itemData, error: itemError } = await supabase
        .from('menu_items')
        .select('*, menu_categories(name)')
        .eq('id', itemId)
        .single();
      if (itemError) throw itemError;

      // 2. Fetch Groups
      const { data: groups, error: groupsError } = await supabase
        .from('modifier_groups')
        .select('*')
        .eq('menu_item_id', itemId)
        .order('sort_order');
      if (groupsError) throw groupsError;

      // 3. Fetch Options (if groups exist)
      let options: any[] = [];
      if (groups && groups.length > 0) {
        const groupIds = groups.map(g => g.id);
        const { data: opts, error: optsError } = await supabase
          .from('modifier_options')
          .select('*')
          .in('group_id', groupIds)
          .order('sort_order');
        if (optsError) throw optsError;
        options = opts || [];
      }

      // 4. Assemble manually
      const assembledGroups = groups?.map(group => ({
        ...group,
        modifier_options: options.filter(opt => opt.group_id === group.id)
      })) || [];

      return { ...itemData, modifier_groups: assembledGroups };
    }
  });

  // This screen is a hidden tab (see (main)/_layout.tsx), so navigating away
  // and back to it -- a different item, or the very same item to add
  // another with different modifiers -- reuses the same mounted instance
  // rather than remounting. Resetting only once on mount (or only when
  // itemId changed) left a revisited item stuck showing "Added to Cart"
  // from the last visit, so this resets on every focus instead.
  //
  // Pre-checking is_default options (e.g. a combo's included side/drink)
  // happens in the same pass: a required single-select group with no
  // staff-chosen default still gets one -- defaulting to its first option
  // and letting the customer change it, rather than making them decide from
  // a blank state, is the same default-bias effect (Johnson & Goldstein)
  // that makes opt-out systems consistently outperform opt-in ones. Walked
  // depth-first (mirroring visibleGroups below) so a default that reveals a
  // nested group cascades a default into that group too.
  useFocusEffect(
    useCallback(() => {
      setQuantity(1);
      setSpecialInstructions('');
      setJustAdded(false);

      const allGroups = data?.modifier_groups;
      if (!allGroups) {
        setSelections({});
        return;
      }

      const defaults: Record<string, string[]> = {};
      const applyDefaults = (group: any) => {
        const options = group.modifier_options || [];
        let chosenIds: string[] = options.filter((opt: any) => opt.is_default).map((opt: any) => opt.id);
        if (chosenIds.length === 0 && group.is_required && group.max_selections === 1 && options.length > 0) {
          chosenIds = [options[0].id];
        }
        if (chosenIds.length > 0) defaults[group.id] = chosenIds;

        chosenIds.forEach((optId: string) => {
          allGroups
            .filter((g: any) => g.parent_option_id === optId)
            .forEach(applyDefaults);
        });
      };

      allGroups.filter((g: any) => !g.parent_option_id).forEach(applyDefaults);
      setSelections(defaults);
    }, [data])
  );

  // A group nested under a parent_option_id only applies once that option is
  // selected (e.g. "Greek Fries" toppings only show once "Greek Fries" is chosen).
  // Groups are walked depth-first so a nested group always renders directly
  // after the option that revealed it, regardless of the order the database
  // happens to return rows in.
  const selectedOptionIds = useMemo(() => new Set(Object.values(selections).flat()), [selections]);
  const visibleGroups = useMemo(() => {
    const allGroups = data?.modifier_groups || [];
    const result: any[] = [];
    const addWithChildren = (group: any) => {
      result.push(group);
      (group.modifier_options || []).forEach((opt: any) => {
        if (!selectedOptionIds.has(opt.id)) return;
        allGroups
          .filter((g: any) => g.parent_option_id === opt.id)
          .forEach(addWithChildren);
      });
    };
    allGroups.filter((g: any) => !g.parent_option_id).forEach(addWithChildren);
    return result;
  }, [data, selectedOptionIds]);

  // When an option that reveals a nested group (e.g. "Philly Fries" ->
  // its own toppings group) gets deselected -- either directly, or by
  // picking a different option in the same single-select group -- any
  // selections made in that nested group (and further nested below it)
  // need to be forgotten, or they'd silently reappear if the user picks
  // the original option again.
  const clearDescendantSelections = (
    removedOptionIds: string[],
    selections: Record<string, string[]>
  ) => {
    const allGroups = data?.modifier_groups || [];
    const next = { ...selections };
    const queue = [...removedOptionIds];
    while (queue.length > 0) {
      const optionId = queue.shift()!;
      allGroups
        .filter((g: any) => g.parent_option_id === optionId)
        .forEach((g: any) => {
          queue.push(...(next[g.id] || []));
          delete next[g.id];
        });
    }
    return next;
  };

  // Flat lookup across every group on this item (not just the one being
  // toggled) so conflict-checking below can catch a clash even if the
  // conflicting option happens to live in a different group.
  const optionNameById = useMemo(() => {
    const map: Record<string, string> = {};
    (data?.modifier_groups || []).forEach((g: any) => {
      (g.modifier_options || []).forEach((o: any) => {
        map[o.id] = o.name;
      });
    });
    return map;
  }, [data]);

  const handleToggleOption = (groupId: string, optionId: string, maxSelections: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelections(prev => {
      const groupSelections = prev[groupId] || [];
      const isSelected = groupSelections.includes(optionId);

      if (isSelected) {
        const next = { ...prev, [groupId]: groupSelections.filter(id => id !== optionId) };
        return clearDescendantSelections([optionId], next);
      }

      // Selecting an option (e.g. "Extra Cheese") first clears any already
      // selected option anywhere on this item that it conflicts with (e.g.
      // "No Cheese") -- see lib/modifierConflicts.ts. Applies to every item
      // and every modifier group the same way, since it's keyed purely off
      // option names, not any per-item configuration.
      const newOptionName = optionNameById[optionId];
      const conflictingIds = Object.values(prev)
        .flat()
        .filter((id) => {
          const existingName = optionNameById[id];
          return !!existingName && !!newOptionName && optionsConflict(existingName, newOptionName);
        });

      let next = prev;
      if (conflictingIds.length > 0) {
        const stripped: Record<string, string[]> = {};
        Object.entries(prev).forEach(([gId, ids]) => {
          stripped[gId] = ids.filter((id) => !conflictingIds.includes(id));
        });
        next = clearDescendantSelections(conflictingIds, stripped);
      }

      const currentGroupSelections = next[groupId] || [];

      if (maxSelections === 1) {
        return clearDescendantSelections(groupSelections, { ...next, [groupId]: [optionId] });
      }

      if (currentGroupSelections.length >= maxSelections) {
        return next;
      }

      return { ...next, [groupId]: [...currentGroupSelections, optionId] };
    });
  };

  const isValid = useMemo(() => {
    return visibleGroups.every((group: any) => {
      const count = (selections[group.id] || []).length;
      return count >= group.min_selections;
    });
  }, [visibleGroups, selections]);

  const calculatedPrice = useMemo(() => {
    if (!data) return 0;
    let total = data.base_price;
    visibleGroups.forEach((group: any) => {
      const groupSelectedIds = selections[group.id] || [];
      group.modifier_options?.forEach((opt: any) => {
        if (groupSelectedIds.includes(opt.id)) {
          total += opt.price_adjustment;
        }
      });
    });
    return total * quantity;
  }, [data, visibleGroups, selections, quantity]);

  // A redeemed reward is always free, whatever modifiers get picked -- the
  // price shown/charged is 0 rather than calculatedPrice, and quantity is
  // locked to 1 (the quantity stepper below is hidden in that case) since a
  // reward only ever grants one of the item.
  const finalPrice = promoCode ? 0 : calculatedPrice;

  // Drilling in is now Category Grid -> Category Items -> here (see
  // menu/[id].tsx's redesign), so both the back button and the
  // post-add-to-cart redirect should return to that category's item list,
  // not skip past it to the top-level category grid. The one exception is
  // arriving here from the cart's upsell tray (CartUpsellTray) -- that
  // customer was never browsing the category grid, so send them back to
  // the cart instead of dropping them somewhere they never were.
  const goBackToCategory = useCallback(() => {
    if (returnTo === 'cart') {
      router.replace('/(main)/cart');
      return;
    }
    if (!data) return;
    if (data.category_id) {
      router.replace({
        pathname: '/(main)/menu-category',
        params: {
          categoryId: data.category_id,
          categoryName: data.menu_categories?.name ?? '',
          locationId: data.location_id,
        },
      });
    } else {
      router.replace(`/(main)/menu/${data.location_id}`);
    }
  }, [data, returnTo]);
  useBackHandler(goBackToCategory);

  const handleAddToCart = () => {
    if (!data || justAdded) return;

    const modifiers = visibleGroups.flatMap((group: any) => {
      const groupSelectedIds = selections[group.id] || [];
      return group.modifier_options
        .filter((opt: any) => groupSelectedIds.includes(opt.id))
        .map((opt: any) => ({
          optionId: opt.id,
          name: opt.name,
          price: opt.price_adjustment
        }));
    });

    addItem({
      cartItemId: Math.random().toString(36).substr(2, 9),
      menuItemId: data.id,
      name: data.name,
      basePrice: data.base_price,
      quantity: promoCode ? 1 : quantity,
      modifiers,
      totalPrice: finalPrice,
      specialInstructions: specialInstructions.trim() || undefined,
      promoCode: promoCode || undefined,
      imageUrl: data.image_url,
    }, data.location_id!);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setJustAdded(true);
    setTimeout(() => {
      goBackToCategory();
    }, 600);
  };

  if (isLoading) {
    return (
      <View className="flex-1 bg-[#FAF6F0] pt-12 px-4">
        <SkeletonBox width={80} height={24} style={{ marginBottom: 16 }} />
        <SkeletonBox height={224} borderRadius={16} style={{ marginBottom: 16 }} />
        <SkeletonBox width="60%" height={28} style={{ marginBottom: 12 }} />
        <SkeletonBox width="90%" height={16} style={{ marginBottom: 8 }} />
        <SkeletonBox width={80} height={22} style={{ marginBottom: 24 }} />
        <SkeletonBox width="40%" height={20} style={{ marginBottom: 16 }} />
        {[1, 2, 3].map(i => (
          <SkeletonBox key={i} height={44} style={{ marginBottom: 12 }} />
        ))}
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 bg-[#FAF6F0] pt-20 px-4">
        <Text className="text-[#A61C14] font-inter-bold text-xl mb-4">Database Error:</Text>
        <Text className="text-[#1C1917]">{error.message}</Text>
      </View>
    );
  }

  if (!data) {
    return (
      <View className="flex-1 bg-[#FAF6F0] justify-center items-center">
        <Text className="text-[#78716C] text-lg">Item not found</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#FAF6F0] pt-12">
      <ScrollView
        ref={scrollViewRef}
        className="flex-1 px-4"
        contentContainerStyle={{ paddingBottom: keyboardHeight }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <TouchableOpacity
          onPress={goBackToCategory}
          className="flex-row items-center py-4 pr-8 -ml-2 mb-2"
        >
          <Ionicons name="chevron-back" size={28} color="#A61C14" />
          <Text className="text-[#A61C14] font-inter-bold text-xl">Back</Text>
        </TouchableOpacity>

        {data.image_url && (
          <Image 
            source={{ uri: data.image_url }} 
            className="w-full h-56 rounded-2xl bg-stone-200 mb-4"
            resizeMode="cover"
          />
        )}

        <Text className="text-3xl font-display-bold text-[#1C1917]">{data.name}</Text>
        {data.description && <Text className="text-[#78716C] mt-2 text-base">{data.description}</Text>}
        <Text className="text-2xl font-inter-bold mt-2 text-[#A61C14]">${data.base_price.toFixed(2)}</Text>

        {promoCode && (
          <View className="flex-row items-center bg-[#FAF6F0] border border-[#A61C14] rounded-lg px-3 py-2 mt-3 self-start">
            <Ionicons name="gift" size={16} color="#A61C14" />
            <Text className="text-[#A61C14] font-inter-bold ml-2">
              FREE with {promoTitle || 'your reward'} -- modifiers included
            </Text>
          </View>
        )}

        {visibleGroups.map((group: any) => (
          <View key={group.id} className="mt-6 border-t border-stone-200 pt-4">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-lg font-inter-bold text-[#1C1917]">{group.name}</Text>
              <Text className="text-[#78716C] text-xs font-inter-semibold uppercase">
                {group.is_required ? 'Required' : 'Optional'} (Max {group.max_selections})
              </Text>
            </View>
            
            {group.modifier_options?.map((option: any) => {
              const isSelected = (selections[group.id] || []).includes(option.id);
              return (
                <TouchableOpacity 
                  key={option.id}
                  onPress={() => handleToggleOption(group.id, option.id, group.max_selections)}
                  className="flex-row justify-between items-center py-3.5 border-b border-stone-100"
                >
                  <Text className={`text-base ${isSelected ? 'font-inter-bold text-[#A61C14]' : 'text-[#1C1917]'}`}>
                    {option.name} {isSelected && '✓'}
                  </Text>
                  {!promoCode && option.price_adjustment > 0 && (
                    <Text className="text-[#78716C] font-inter-medium">+${option.price_adjustment.toFixed(2)}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}

        {data.menu_categories?.name !== 'Drinks' && (
          <View className="mt-6 border-t border-stone-200 pt-4">
            <Text className="text-lg font-inter-bold text-[#1C1917] mb-2">Special Instructions</Text>
            <TextInput
              className="bg-white border border-stone-300 rounded-xl p-4 text-base text-[#1C1917] min-h-[90px]"
              placeholder="e.g. no onions please, extra napkins..."
              placeholderTextColor="#A8A29E"
              value={specialInstructions}
              onChangeText={setSpecialInstructions}
              onFocus={() => setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100)}
              multiline
              textAlignVertical="top"
            />
          </View>
        )}

        <ItemAddOns locationId={data.location_id!} excludeCategoryName={data.menu_categories?.name} />
      </ScrollView>

      {/* Bottom Action Bar */}
      <View className="p-4 border-t border-stone-200 bg-white">
        {/* A reward always grants exactly one of the item -- no stepper to
            avoid stacking multiple free items off a single redemption. */}
        {!promoCode && (
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-lg font-inter-bold text-[#1C1917]">Quantity:</Text>
            <View className="flex-row items-center bg-stone-100 rounded-xl p-1 border border-stone-200">
              <TouchableOpacity
                className="bg-white px-4 py-2 rounded-lg shadow-sm"
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setQuantity(Math.max(1, quantity - 1));
                }}
              >
                <Text className="text-xl font-inter-bold text-[#1C1917]">-</Text>
              </TouchableOpacity>
              <Text className="px-6 text-xl font-inter-bold text-[#1C1917]">{quantity}</Text>
              <TouchableOpacity
                className="bg-white px-4 py-2 rounded-lg shadow-sm"
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setQuantity(quantity + 1);
                }}
              >
                <Text className="text-xl font-inter-bold text-[#1C1917]">+</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <TouchableOpacity
          onPress={handleAddToCart}
          disabled={!isValid || justAdded}
          className={`py-4 rounded-xl items-center shadow-md flex-row justify-center ${
            justAdded ? 'bg-green-600' : isValid ? 'bg-[#A61C14] active:bg-[#85140E]' : 'bg-stone-300'
          }`}
        >
          {justAdded ? (
            <>
              <Ionicons name="checkmark-circle" size={22} color="#F4ECE1" style={{ marginRight: 8 }} />
              <Text className="font-display text-lg text-[#F4ECE1]">Added to Cart</Text>
            </>
          ) : (
            <Text className={`font-display text-lg ${isValid ? 'text-[#F4ECE1]' : 'text-stone-500'}`}>
              {promoCode ? 'Add to Cart - FREE' : `Add to Cart - $${finalPrice.toFixed(2)}`}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}