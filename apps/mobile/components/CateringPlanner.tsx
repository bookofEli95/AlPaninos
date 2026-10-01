import { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import { useCartStore } from '../store/cartStore';
import {
  PlannerPackage,
  PlanLine,
  planCatering,
  suggestAddOns,
  PLANNER_DEFAULT_PEOPLE,
  PLANNER_MAX_PEOPLE,
  PLANNER_MIN_PEOPLE,
} from '../lib/cateringPlanner';
import { CATERING_MIN_SUBTOTAL, servesLabel } from '../lib/catering';
import { tabularNums } from '../lib/typography';

const QUICK_COUNTS = [10, 20, 30, 50];

type AddOnChoice = { id: string; name: string; price: number };
// A side/dessert whose only choice is one pick from a list (fries type,
// salad, dessert mix) -- shown right in the planner. Anything more involved
// opens its own screen instead.
type AddOnChoices = { options: AddOnChoice[]; defaultId: string };

// "Feeding [ 15 ] people" -> the packages to order. Each suggestion opens
// the package with its quantity already set, since boards still need their
// sandwiches chosen.
export default function CateringPlanner({ packages }: { packages: PlannerPackage[] }) {
  const router = useRouter();
  const cartItems = useCartStore((state) => state.items);
  const [people, setPeople] = useState(PLANNER_DEFAULT_PEOPLE);
  const plan = useMemo(() => planCatering(people, packages), [people, packages]);
  const addOns = useMemo(() => suggestAddOns(people, packages), [people, packages]);
  const addItem = useCartStore((state) => state.addItem);

  // Each add-on's choices, looked up once.
  const addOnIds = useMemo(() => addOns.map((a) => a.pkg.id).sort(), [addOns]);
  const { data: choicesById } = useQuery({
    queryKey: ['cateringAddOnChoices', addOnIds.join(',')],
    queryFn: async () => {
      const { data: groups, error } = await (supabase as any)
        .from('modifier_groups')
        .select('id, menu_item_id, max_selections, allow_quantity, parent_option_id')
        .in('menu_item_id', addOnIds);
      if (error) throw error;
      const groupIds = (groups || []).map((g: any) => g.id);
      const { data: options, error: optionError } = groupIds.length
        ? await (supabase as any)
            .from('modifier_options')
            .select('id, group_id, name, price_adjustment, is_default, sort_order')
            .in('group_id', groupIds)
            .order('sort_order')
        : { data: [], error: null };
      if (optionError) throw optionError;

      const result = new Map<string, AddOnChoices | null>();
      addOnIds.forEach((pkgId) => {
        const own = (groups || []).filter((g: any) => g.menu_item_id === pkgId);
        const group = own[0];
        const simple =
          own.length === 1 && !group.parent_option_id && group.max_selections === 1 && !group.allow_quantity;
        const groupOptions = simple ? (options || []).filter((o: any) => o.group_id === group.id) : [];
        result.set(
          pkgId,
          simple && groupOptions.length > 0
            ? {
                options: groupOptions.map((o: any) => ({ id: o.id, name: o.name, price: Number(o.price_adjustment) || 0 })),
                defaultId: (groupOptions.find((o: any) => o.is_default) ?? groupOptions[0]).id,
              }
            : null
        );
      });
      return result;
    },
    enabled: addOnIds.length > 0,
    staleTime: 10 * 60000,
  });

  // What the customer has changed on each add-on: its choice and how many.
  // A new headcount starts the amounts over at the suggestion.
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  useEffect(() => setAmounts({}), [people]);

  const addAddOn = (line: PlanLine, choices: AddOnChoices) => {
    const { pkg } = line;
    if (!pkg.location_id) return;
    const quantity = amounts[pkg.id] ?? line.quantity;
    const choice = choices.options.find((o) => o.id === (picked[pkg.id] ?? choices.defaultId)) ?? choices.options[0];
    const unit = Number(pkg.base_price) + choice.price;
    addItem(
      {
        cartItemId: Math.random().toString(36).substring(2, 9),
        menuItemId: pkg.id,
        name: pkg.name,
        basePrice: Number(pkg.base_price),
        quantity,
        modifiers: [{ optionId: choice.id, name: choice.name, price: choice.price }],
        totalPrice: unit * quantity,
        imageUrl: pkg.image_url ?? null,
      },
      pkg.location_id
    );
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const inCart = (menuItemId: string) =>
    cartItems.filter((i) => i.menuItemId === menuItemId).reduce((sum, i) => sum + i.quantity, 0);

  const changePeople = (next: number) => {
    const clamped = Math.min(PLANNER_MAX_PEOPLE, Math.max(PLANNER_MIN_PEOPLE, next));
    if (clamped === people) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setPeople(clamped);
  };

  if (plan.mains.length === 0) return null;

  const renderLine = ({ pkg, quantity }: PlanLine, detail: string) => {
    const added = inCart(pkg.id) >= quantity;
    return (
      <View key={pkg.id} className="flex-row items-center py-2.5 border-b border-stone-100">
        <View className="flex-1 mr-2">
          <Text className="text-sm font-inter-bold text-[#1C1917]">
            {quantity}× {pkg.name}
          </Text>
          <Text className="text-xs text-[#78716C]">
            {detail} • ${(Number(pkg.base_price) * quantity).toFixed(2)}
          </Text>
        </View>
        {added ? (
          <View className="flex-row items-center px-2.5 py-1.5">
            <Ionicons name="checkmark-circle" size={16} color="#047857" />
            <Text className="text-emerald-800 text-[13px] font-inter-bold ml-1">In Cart</Text>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/(main)/item/[id]', params: { id: pkg.id, qty: String(quantity) } })}
            className="bg-[#A61C14] px-3.5 py-1.5 rounded-lg active:bg-[#85140E]"
          >
            <Text className="text-[#F4ECE1] text-[13px] font-inter-bold">Choose</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View className="bg-white border border-stone-200 rounded-2xl p-4 mx-2 mb-3 shadow-sm">
      <View className="flex-row items-center mb-3">
        <Ionicons name="calculator-outline" size={18} color="#A61C14" />
        <Text className="text-base font-inter-bold text-[#1C1917] ml-2">How Many Are You Feeding?</Text>
      </View>

      <View className="flex-row items-center justify-between mb-2.5">
        <View className="flex-row items-center bg-[#FAF6F0] rounded-xl p-1 border border-stone-200">
          <TouchableOpacity
            onPress={() => changePeople(people - 1)}
            disabled={people <= PLANNER_MIN_PEOPLE}
            className={`w-9 h-9 rounded-lg items-center justify-center ${people <= PLANNER_MIN_PEOPLE ? 'opacity-40' : 'bg-white'}`}
          >
            <Ionicons name="remove" size={18} color="#1C1917" />
          </TouchableOpacity>
          <Text className="w-12 text-center text-xl font-inter-extrabold text-[#1C1917]" style={tabularNums}>
            {people}
          </Text>
          <TouchableOpacity
            onPress={() => changePeople(people + 1)}
            disabled={people >= PLANNER_MAX_PEOPLE}
            className={`w-9 h-9 rounded-lg items-center justify-center ${people >= PLANNER_MAX_PEOPLE ? 'opacity-40' : 'bg-white'}`}
          >
            <Ionicons name="add" size={18} color="#1C1917" />
          </TouchableOpacity>
        </View>
        <Text className="text-sm font-inter-semibold text-[#78716C] flex-1 ml-3">people</Text>
      </View>

      <View className="flex-row mb-2">
        {QUICK_COUNTS.map((n) => (
          <TouchableOpacity
            key={n}
            onPress={() => changePeople(n)}
            className={`px-3 py-1 rounded-full border mr-1.5 ${people === n ? 'bg-[#1C1917] border-[#1C1917]' : 'bg-white border-stone-300'}`}
          >
            <Text className={`text-[13px] font-inter-bold ${people === n ? 'text-[#F4ECE1]' : 'text-[#1C1917]'}`}>{n}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text className="text-xs font-inter-bold uppercase tracking-wider text-stone-500 mt-1">We Suggest</Text>
      {plan.mains.map((line) =>
        renderLine(line, line.pkg.serves_min ? servesLabel(line.pkg.serves_min, line.pkg.serves_max) : '')
      )}
      {plan.drinks.map((line) =>
        renderLine(line, `${(line.pkg.serves_max ?? line.pkg.serves_min ?? 0) * line.quantity} drinks`)
      )}

      <View className="flex-row justify-between items-center mt-2.5">
        <Text className="text-[13px] text-[#78716C] flex-1 mr-2">Feeds up to {plan.mainsServe}.</Text>
        <Text className="text-sm font-inter-bold text-[#1C1917]" style={tabularNums}>
          ~${plan.total.toFixed(2)}
        </Text>
      </View>
      {plan.total < CATERING_MIN_SUBTOTAL && (
        <Text className="text-xs text-[#A61C14] mt-1">
          Catering has a ${CATERING_MIN_SUBTOTAL} minimum -- a side or dessert below gets you there.
        </Text>
      )}

      {/* Sides and dessert, sized for the group, added in one tap */}
      {addOns.length > 0 && (
        <View className="mt-4 pt-3 border-t border-stone-200">
          <Text className="text-xs font-inter-bold uppercase tracking-wider text-stone-500">Make It a Spread</Text>
          <Text className="text-xs text-[#78716C] mb-1">
            Sides and dessert, sized for {people} people.
          </Text>
          {addOns.map((line) => {
            const { pkg } = line;
            const choices = choicesById?.get(pkg.id);
            const quantity = amounts[pkg.id] ?? line.quantity;
            const chosenId = choices ? picked[pkg.id] ?? choices.defaultId : null;
            const chosen = choices?.options.find((o) => o.id === chosenId);
            const unit = Number(pkg.base_price) + (chosen?.price ?? 0);
            const each = pkg.serves_max ?? pkg.serves_min ?? 0;
            const already = inCart(pkg.id);
            return (
              <View key={pkg.id} className="py-3 border-b border-stone-100">
                <View className="flex-row items-center">
                  <View className="flex-1 mr-2">
                    <Text className="text-sm font-inter-bold text-[#1C1917]">{pkg.name}</Text>
                    <Text className="text-xs text-[#78716C]">
                      {pkg.serves_min ? `${servesLabel(pkg.serves_min, pkg.serves_max)} · ` : ''}${unit.toFixed(2)} each
                    </Text>
                  </View>
                  <View className="flex-row items-center bg-[#FAF6F0] rounded-full border border-stone-200" style={{ padding: 2 }}>
                    <TouchableOpacity
                      onPress={() => setAmounts((a) => ({ ...a, [pkg.id]: Math.max(1, quantity - 1) }))}
                      disabled={quantity <= 1}
                      accessibilityLabel={`One less ${pkg.name}`}
                      className="w-7 h-7 rounded-full bg-white items-center justify-center"
                      style={{ opacity: quantity <= 1 ? 0.4 : 1 }}
                    >
                      <Ionicons name="remove" size={14} color="#1C1917" />
                    </TouchableOpacity>
                    <Text className="w-7 text-center text-sm font-inter-bold text-[#1C1917]" style={tabularNums}>
                      {quantity}
                    </Text>
                    <TouchableOpacity
                      onPress={() => setAmounts((a) => ({ ...a, [pkg.id]: Math.min(20, quantity + 1) }))}
                      accessibilityLabel={`One more ${pkg.name}`}
                      className="w-7 h-7 rounded-full bg-white items-center justify-center"
                    >
                      <Ionicons name="add" size={14} color="#1C1917" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* The one choice it needs, picked right here. Only the
                    colours change on a pick, so nothing moves. */}
                {!!choices && choices.options.length > 1 && (
                  <View className="flex-row flex-wrap mt-2" style={{ gap: 6 }}>
                    {choices.options.map((option) => {
                      const active = option.id === chosenId;
                      return (
                        <TouchableOpacity
                          key={option.id}
                          onPress={() => {
                            Haptics.selectionAsync().catch(() => {});
                            setPicked((p) => ({ ...p, [pkg.id]: option.id }));
                          }}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: active }}
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: active ? '#A61C14' : '#D6D3D1',
                            backgroundColor: active ? '#A61C14' : '#FFFFFF',
                          }}
                        >
                          <Text
                            className="text-[13px] font-inter-semibold"
                            style={{ color: active ? '#F4ECE1' : '#1C1917' }}
                          >
                            {option.name}
                            {option.price > 0 ? ` +$${option.price.toFixed(2)}` : ''}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                <View className="flex-row items-center justify-between mt-2.5">
                  <View className="flex-row items-center flex-1 mr-2">
                    {already > 0 ? (
                      <>
                        <Ionicons name="checkmark-circle" size={15} color="#047857" />
                        <Text className="text-emerald-800 text-xs font-inter-bold ml-1">{already} in your cart</Text>
                      </>
                    ) : (
                      each > 0 && (
                        <Text className="text-xs text-[#78716C]">Enough for {quantity * each} people</Text>
                      )
                    )}
                  </View>
                  {choices ? (
                    <TouchableOpacity
                      onPress={() => addAddOn(line, choices)}
                      activeOpacity={0.85}
                      className="flex-row items-center bg-[#A61C14] px-3.5 py-2 rounded-lg"
                    >
                      <Ionicons name="add" size={15} color="#F4ECE1" />
                      <Text className="text-[#F4ECE1] text-[13px] font-inter-bold ml-0.5" style={tabularNums}>
                        {already > 0 ? 'Add More' : 'Add'} · ${(unit * quantity).toFixed(2)}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    // Still loading, or more to choose than fits here.
                    <TouchableOpacity
                      onPress={() =>
                        router.push({ pathname: '/(main)/item/[id]', params: { id: pkg.id, qty: String(quantity) } })
                      }
                      className="bg-[#A61C14] px-3.5 py-2 rounded-lg"
                    >
                      <Text className="text-[#F4ECE1] text-[13px] font-inter-bold">Choose</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
