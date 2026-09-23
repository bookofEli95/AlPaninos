import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Keyboard,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { useCartStore } from '../../../store/cartStore';
import { useBackHandler } from '../../../hooks/useBackHandler';
import SkeletonBox from '../../../components/Skeleton';
import ItemAddOns from '../../../components/ItemAddOns';
import { optionsConflict } from '../../../lib/modifierConflicts';

const QUICK_INSTRUCTIONS = [
  'Cut in half',
  'Sauce on the side',
  'Extra crispy / well pressed',
  'No napkins needed',
  'Wrap separately',
];

export default function ItemDetailScreen() {
  // promoCode/promoTitle are only present when this item was opened from a
  // wheel-prize/PaninoPoints redemption (see deals.tsx/profile.tsx's
  // giveFreeItem) -- their presence is what makes this whole item, including
  // any modifiers picked below, free. Nothing is "applied" anywhere else
  // until Add to Cart actually runs (see handleAddToCart), so backing out of
  // this screen without finishing leaves no stray applied state behind.
  const {
    id: itemId,
    promoCode,
    promoTitle,
    returnTo,
  } = useLocalSearchParams<{ id: string; promoCode?: string; promoTitle?: string; returnTo?: string }>();
  const router = useRouter();
  const addItem = useCartStore((state) => state.addItem);

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
        const groupIds = groups.map((g) => g.id);
        const { data: opts, error: optsError } = await supabase
          .from('modifier_options')
          .select('*')
          .in('group_id', groupIds)
          .order('sort_order');
        if (optsError) throw optsError;
        options = opts || [];
      }

      // 4. Assemble manually
      const assembledGroups =
        groups?.map((group) => ({
          ...group,
          modifier_options: options.filter((opt) => opt.group_id === group.id),
        })) || [];

      return { ...itemData, modifier_groups: assembledGroups };
    },
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
    setSelections((prev) => {
      const groupSelections = prev[groupId] || [];
      const isSelected = groupSelections.includes(optionId);

      if (isSelected) {
        const next = { ...prev, [groupId]: groupSelections.filter((id) => id !== optionId) };
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

  // Identifies the first unsatisfied required group so the CTA below can
  // name it directly ("Select Choose Your Fries to Continue") instead of
  // just greying out with no explanation. Falls back to is_required when
  // min_selections is left at its column default of 0 -- a required group
  // that was imported/configured without an explicit min_selections would
  // otherwise silently accept zero selections.
  const missingRequiredGroup = useMemo(() => {
    return visibleGroups.find((group: any) => {
      const count = (selections[group.id] || []).length;
      return count < (group.min_selections || (group.is_required ? 1 : 0));
    });
  }, [visibleGroups, selections]);

  const isValid = !missingRequiredGroup;

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
  }, [data, returnTo, router]);
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
          price: opt.price_adjustment,
        }));
    });

    addItem(
      {
        cartItemId: Math.random().toString(36).substring(2, 9),
        menuItemId: data.id,
        name: data.name,
        basePrice: data.base_price,
        quantity: promoCode ? 1 : quantity,
        modifiers,
        totalPrice: finalPrice,
        specialInstructions: specialInstructions.trim() || undefined,
        promoCode: promoCode || undefined,
        imageUrl: data.image_url,
      },
      data.location_id!
    );

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setJustAdded(true);
    setTimeout(() => {
      goBackToCategory();
    }, 600);
  };

  // Treats the field as a comma-separated list of segments and toggles by
  // exact segment match, rather than a raw substring replace -- typing
  // "please wrap it separately" by hand and then tapping the "Wrap
  // separately" chip would otherwise mangle the sentence instead of
  // cleanly adding/removing a distinct preset.
  const handleToggleQuickInstruction = (text: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSpecialInstructions((prev) => {
      const segments = prev
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const next = segments.includes(text)
        ? segments.filter((s) => s !== text)
        : [...segments, text];
      return next.join(', ');
    });
  };

  if (isLoading) {
    return (
      <View className="flex-1 bg-[#FAF6F0] pt-14 px-4">
        <SkeletonBox width={70} height={24} style={{ marginBottom: 16 }} />
        <SkeletonBox height={240} borderRadius={24} style={{ marginBottom: 20 }} />
        <SkeletonBox width="70%" height={32} style={{ marginBottom: 10 }} />
        <SkeletonBox width="90%" height={16} style={{ marginBottom: 8 }} />
        <SkeletonBox width={90} height={26} style={{ marginBottom: 24 }} />
        {[1, 2, 3].map((i) => (
          <SkeletonBox key={i} height={60} borderRadius={16} style={{ marginBottom: 12 }} />
        ))}
      </View>
    );
  }

  if (error || !data) {
    return (
      <View className="flex-1 bg-[#FAF6F0] pt-20 px-6 items-center justify-center">
        <Ionicons name="alert-circle-outline" size={40} color="#A61C14" />
        <Text className="text-[#A61C14] font-inter-bold text-lg mt-3 mb-1">
          {error ? 'Unable to load item' : 'Item not found'}
        </Text>
        <Text className="text-stone-500 text-center text-xs mb-6">
          {error ? error.message : 'This menu item is currently unavailable.'}
        </Text>
        <TouchableOpacity
          onPress={() => router.replace('/(main)')}
          className="bg-[#A61C14] px-6 py-3 rounded-xl active:bg-[#85140E]"
        >
          <Text className="text-[#F4ECE1] font-inter-bold text-sm">Return to Menu</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#FAF6F0] pt-12">
      <ScrollView
        ref={scrollViewRef}
        className="flex-1 px-4"
        contentContainerStyle={{ paddingBottom: keyboardHeight + 30 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {/* Navigation Top Header */}
        <View className="flex-row items-center justify-between py-2 mb-2">
          <TouchableOpacity
            onPress={goBackToCategory}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            className="flex-row items-center py-2 pr-4 -ml-2"
          >
            <Ionicons name="chevron-back" size={26} color="#A61C14" />
            <Text className="text-[#A61C14] font-inter-bold text-base">Back</Text>
          </TouchableOpacity>

          {data.menu_categories?.name && (
            <View className="bg-white border border-stone-200 px-3 py-1 rounded-full">
              <Text className="text-stone-600 font-inter-semibold text-xs uppercase tracking-wider">
                {data.menu_categories.name}
              </Text>
            </View>
          )}
        </View>

        {/* Hero Item Image */}
        {data.image_url ? (
          <Image
            source={{ uri: data.image_url }}
            className="w-full h-64 rounded-3xl bg-stone-200 mb-4 shadow-sm"
            resizeMode="cover"
          />
        ) : (
          <View className="w-full h-40 rounded-3xl bg-stone-200/60 items-center justify-center mb-4">
            <Ionicons name="restaurant-outline" size={40} color="#78716C" />
          </View>
        )}

        {/* Item Title & Details */}
        <View className="mb-2">
          <Text className="text-3xl font-display-bold text-[#1C1917] tracking-tight">{data.name}</Text>
          {data.description && (
            <Text className="text-stone-600 mt-2 text-sm leading-5">{data.description}</Text>
          )}
          <Text className="text-2xl font-inter-bold mt-2.5 text-[#A61C14]">${data.base_price.toFixed(2)}</Text>
        </View>

        {/* Promo / Reward Unlocked Banner */}
        {promoCode && (
          <View className="flex-row items-center bg-[#FAF6F0] border border-[#A61C14] rounded-2xl p-3 mt-3">
            <Ionicons name="gift" size={18} color="#A61C14" />
            <View className="ml-2.5 flex-1">
              <Text className="text-[#A61C14] font-inter-bold text-xs uppercase tracking-wider">
                Reward Unlocked
              </Text>
              <Text className="text-[#1C1917] font-inter-semibold text-xs">
                {promoTitle || 'Free Reward Item'} • Modifiers Included
              </Text>
            </View>
          </View>
        )}

        {/* Modifier Groups */}
        {visibleGroups.map((group: any) => {
          const selectedInGroup = selections[group.id] || [];
          const minRequired = group.min_selections || (group.is_required ? 1 : 0);
          const isGroupSatisfied = selectedInGroup.length >= minRequired;
          const isSingleChoice = group.max_selections === 1;

          return (
            <View key={group.id} className="mt-6 border-t border-stone-200/80 pt-4">
              <View className="flex-row justify-between items-center mb-3">
                <View className="flex-row items-center flex-1 mr-2">
                  <Text className="text-lg font-inter-bold text-[#1C1917] mr-2">{group.name}</Text>
                  {minRequired > 0 && !isGroupSatisfied && (
                    <View className="bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-md">
                      <Text className="text-amber-800 text-[10px] font-inter-bold uppercase">Required</Text>
                    </View>
                  )}
                </View>

                <Text className="text-stone-500 text-xs font-inter-medium">
                  {isSingleChoice ? 'Select 1' : group.max_selections ? `Up to ${group.max_selections}` : 'Optional'}
                </Text>
              </View>

              <View className="gap-2">
                {group.modifier_options?.map((option: any) => {
                  const isSelected = selectedInGroup.includes(option.id);

                  return (
                    <TouchableOpacity
                      key={option.id}
                      onPress={() => handleToggleOption(group.id, option.id, group.max_selections)}
                      activeOpacity={0.8}
                      className={`flex-row justify-between items-center p-3.5 rounded-2xl border ${
                        isSelected ? 'bg-white border-[#A61C14] shadow-sm' : 'bg-white/70 border-stone-200'
                      }`}
                    >
                      <View className="flex-row items-center flex-1 mr-2">
                        <View
                          className={`w-5 h-5 ${isSingleChoice ? 'rounded-full' : 'rounded-md'} border mr-3 items-center justify-center ${
                            isSelected ? 'border-[#A61C14] bg-[#A61C14]' : 'border-stone-300 bg-stone-50'
                          }`}
                        >
                          {isSelected && (
                            <Ionicons
                              name={isSingleChoice ? 'ellipse' : 'checkmark'}
                              size={isSingleChoice ? 7 : 12}
                              color="#F4ECE1"
                            />
                          )}
                        </View>

                        <Text
                          className={`text-sm ${
                            isSelected ? 'font-inter-bold text-[#1C1917]' : 'font-inter-medium text-stone-800'
                          }`}
                        >
                          {option.name}
                        </Text>
                      </View>

                      {!promoCode && option.price_adjustment > 0 && (
                        <Text
                          className={`font-inter-bold text-xs ${isSelected ? 'text-[#A61C14]' : 'text-stone-500'}`}
                        >
                          +${option.price_adjustment.toFixed(2)}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        })}

        {/* Special Instructions & Fast Preset Chips */}
        {data.menu_categories?.name !== 'Drinks' && (
          <View className="mt-6 border-t border-stone-200/80 pt-4">
            <Text className="text-base font-inter-bold text-[#1C1917] mb-1">Special Kitchen Notes</Text>
            <Text className="text-stone-500 text-xs mb-3">
              Tap a common instruction or enter custom preferences below.
            </Text>

            <View className="flex-row flex-wrap gap-1.5 mb-2.5">
              {QUICK_INSTRUCTIONS.map((preset) => {
                const isActive = specialInstructions.includes(preset);
                return (
                  <TouchableOpacity
                    key={preset}
                    onPress={() => handleToggleQuickInstruction(preset)}
                    className={`px-3 py-1.5 rounded-full border ${
                      isActive ? 'bg-[#A61C14] border-[#A61C14]' : 'bg-white border-stone-200'
                    }`}
                  >
                    <Text className={`text-xs font-inter-semibold ${isActive ? 'text-[#F4ECE1]' : 'text-stone-600'}`}>
                      {preset}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TextInput
              className="bg-white border border-stone-300 rounded-2xl p-3.5 text-sm text-[#1C1917] min-h-[80px]"
              placeholder="Allergies, packaging preferences, extra napkins..."
              placeholderTextColor="#A8A29E"
              value={specialInstructions}
              onChangeText={setSpecialInstructions}
              onFocus={() => setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 120)}
              multiline
              textAlignVertical="top"
            />
          </View>
        )}

        {/* Dynamic Cross-Category Add-ons */}
        <View className="mt-2 mb-6">
          <ItemAddOns locationId={data.location_id!} excludeCategoryName={data.menu_categories?.name} />
        </View>
      </ScrollView>

      {/* Sticky Bottom Action Tray */}
      <View className="px-5 pt-3 pb-8 border-t border-stone-200 bg-white shadow-lg">
        {/* A reward always grants exactly one of the item -- no stepper to
            avoid stacking multiple free items off a single redemption. */}
        {!promoCode && (
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-sm font-inter-bold text-[#1C1917]">Quantity</Text>
            <View className="flex-row items-center bg-[#FAF6F0] rounded-xl p-1 border border-stone-200">
              <TouchableOpacity
                className="bg-white w-8 h-8 rounded-lg items-center justify-center shadow-sm"
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setQuantity(Math.max(1, quantity - 1));
                }}
              >
                <Ionicons name="remove" size={16} color="#1C1917" />
              </TouchableOpacity>
              <Text className="px-4 text-sm font-inter-bold text-[#1C1917]">{quantity}</Text>
              <TouchableOpacity
                className="bg-white w-8 h-8 rounded-lg items-center justify-center shadow-sm"
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setQuantity(quantity + 1);
                }}
              >
                <Ionicons name="add" size={16} color="#1C1917" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        <TouchableOpacity
          onPress={handleAddToCart}
          disabled={!isValid || justAdded}
          activeOpacity={0.9}
          className={`py-4 px-5 rounded-2xl items-center flex-row justify-between shadow-sm ${
            justAdded ? 'bg-emerald-600' : isValid ? 'bg-[#A61C14] active:bg-[#85140E]' : 'bg-stone-300'
          }`}
        >
          {justAdded ? (
            <View className="flex-1 flex-row items-center justify-center">
              <Ionicons name="checkmark-circle" size={20} color="#F4ECE1" style={{ marginRight: 6 }} />
              <Text className="font-inter-bold text-base text-[#F4ECE1]">Added to Cart!</Text>
            </View>
          ) : !isValid ? (
            <View className="flex-1 items-center justify-center">
              <Text className="font-inter-bold text-sm text-stone-500">
                Select {missingRequiredGroup?.name || 'Required Options'} to Continue
              </Text>
            </View>
          ) : (
            <>
              <Text className="font-inter-bold text-base text-[#F4ECE1]">
                {promoCode ? 'Claim Free Item' : 'Add to Cart'}
              </Text>
              <View className="flex-row items-center">
                <Text className="font-inter-bold text-base text-[#F4ECE1] mr-1.5">
                  {promoCode ? 'FREE' : `$${finalPrice.toFixed(2)}`}
                </Text>
                <Ionicons name="arrow-forward" size={16} color="#F4ECE1" />
              </View>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
