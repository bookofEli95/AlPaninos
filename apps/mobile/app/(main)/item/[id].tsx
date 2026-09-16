import { useState, useMemo, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { useCartStore } from '../../../store/cartStore';
import { Ionicons } from '@expo/vector-icons';

export default function ItemDetailScreen() {
  const { id: itemId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const addItem = useCartStore(state => state.addItem);

  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [quantity, setQuantity] = useState(1);

  const { data, isLoading, error } = useQuery({
    queryKey: ['item', itemId],
    queryFn: async () => {
      // 1. Fetch Item
      const { data: itemData, error: itemError } = await supabase
        .from('menu_items')
        .select('*')
        .eq('id', itemId)
        .single();
      if (itemError) throw itemError;

      // 2. Fetch Groups
      const { data: groups, error: groupsError } = await supabase
        .from('modifier_groups')
        .select('*')
        .eq('menu_item_id', itemId);
      if (groupsError) throw groupsError;

      // 3. Fetch Options (if groups exist)
      let options: any[] = [];
      if (groups && groups.length > 0) {
        const groupIds = groups.map(g => g.id);
        const { data: opts, error: optsError } = await supabase
          .from('modifier_options')
          .select('*')
          .in('group_id', groupIds);
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

  // Pre-check any options marked is_default (e.g. a combo's included side/drink)
  useEffect(() => {
    if (!data?.modifier_groups) return;
    setSelections(prev => {
      if (Object.keys(prev).length > 0) return prev;
      const defaults: Record<string, string[]> = {};
      data.modifier_groups.forEach((group: any) => {
        const defaultIds = group.modifier_options
          ?.filter((opt: any) => opt.is_default)
          .map((opt: any) => opt.id) || [];
        if (defaultIds.length > 0) defaults[group.id] = defaultIds;
      });
      return defaults;
    });
  }, [data]);

  // A group nested under a parent_option_id only applies once that option is
  // selected (e.g. "Greek Fries" toppings only show once "Greek Fries" is chosen)
  const selectedOptionIds = useMemo(() => new Set(Object.values(selections).flat()), [selections]);
  const visibleGroups = useMemo(() => {
    return (data?.modifier_groups || []).filter((group: any) =>
      !group.parent_option_id || selectedOptionIds.has(group.parent_option_id)
    );
  }, [data, selectedOptionIds]);

  const handleToggleOption = (groupId: string, optionId: string, maxSelections: number) => {
    setSelections(prev => {
      const groupSelections = prev[groupId] || [];
      const isSelected = groupSelections.includes(optionId);

      if (isSelected) {
        return { ...prev, [groupId]: groupSelections.filter(id => id !== optionId) };
      }

      if (maxSelections === 1) {
        return { ...prev, [groupId]: [optionId] };
      }

      if (groupSelections.length >= maxSelections) {
        return prev;
      }

      return { ...prev, [groupId]: [...groupSelections, optionId] };
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

  const handleAddToCart = () => {
    if (!data) return;

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
      quantity,
      modifiers,
      totalPrice: calculatedPrice
    }, data.location_id!);

    router.push(`/(main)/menu/${data.location_id}`);
  };

  if (isLoading) {
    return (
      <View className="flex-1 bg-[#FAF6F0] justify-center items-center">
        <ActivityIndicator size="large" color="#A61C14" />
      </View>
    );
  }
  
  if (error) {
    return (
      <View className="flex-1 bg-[#FAF6F0] pt-20 px-4">
        <Text className="text-[#A61C14] font-bold text-xl mb-4">Database Error:</Text>
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
      <ScrollView className="flex-1 px-4">
        <TouchableOpacity 
          onPress={() => router.push(`/(main)/menu/${data.location_id}`)} 
          className="flex-row items-center py-4 pr-8 -ml-2 mb-2"
        >
          <Ionicons name="chevron-back" size={28} color="#A61C14" />
          <Text className="text-[#A61C14] font-bold text-xl">Back</Text>
        </TouchableOpacity>

        {data.image_url && (
          <Image 
            source={{ uri: data.image_url }} 
            className="w-full h-56 rounded-2xl bg-stone-200 mb-4"
            resizeMode="cover"
          />
        )}

        <Text className="text-3xl font-extrabold text-[#1C1917]">{data.name}</Text>
        {data.description && <Text className="text-[#78716C] mt-2 text-base">{data.description}</Text>}
        <Text className="text-2xl font-bold mt-2 text-[#A61C14]">${data.base_price.toFixed(2)}</Text>

        {visibleGroups.map((group: any) => (
          <View key={group.id} className="mt-6 border-t border-stone-200 pt-4">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-lg font-bold text-[#1C1917]">{group.name}</Text>
              <Text className="text-[#78716C] text-xs font-semibold uppercase">
                {group.is_required ? `Required (Min ${group.min_selections})` : `Optional (Max ${group.max_selections})`}
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
                  <Text className={`text-base ${isSelected ? 'font-bold text-[#A61C14]' : 'text-[#1C1917]'}`}>
                    {option.name} {isSelected && '✓'}
                  </Text>
                  {option.price_adjustment > 0 && (
                    <Text className="text-[#78716C] font-medium">+${option.price_adjustment.toFixed(2)}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </ScrollView>

      {/* Bottom Action Bar */}
      <View className="p-4 border-t border-stone-200 bg-white">
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-lg font-bold text-[#1C1917]">Quantity:</Text>
          <View className="flex-row items-center bg-stone-100 rounded-xl p-1 border border-stone-200">
            <TouchableOpacity 
              className="bg-white px-4 py-2 rounded-lg shadow-sm"
              onPress={() => setQuantity(Math.max(1, quantity - 1))}
            >
              <Text className="text-xl font-bold text-[#1C1917]">-</Text>
            </TouchableOpacity>
            <Text className="px-6 text-xl font-bold text-[#1C1917]">{quantity}</Text>
            <TouchableOpacity 
              className="bg-white px-4 py-2 rounded-lg shadow-sm"
              onPress={() => setQuantity(quantity + 1)}
            >
              <Text className="text-xl font-bold text-[#1C1917]">+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity 
          onPress={handleAddToCart}
          disabled={!isValid}
          className={`py-4 rounded-xl items-center shadow-md ${
            isValid ? 'bg-[#A61C14] active:bg-[#85140E]' : 'bg-stone-300'
          }`}
        >
          <Text className={`font-bold text-lg ${isValid ? 'text-[#F4ECE1]' : 'text-stone-500'}`}>
            Add to Cart - ${calculatedPrice.toFixed(2)}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}