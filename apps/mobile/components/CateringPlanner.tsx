import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useCartStore } from '../store/cartStore';
import {
  PlannerPackage,
  PlanLine,
  planCatering,
  PLANNER_DEFAULT_PEOPLE,
  PLANNER_MAX_PEOPLE,
  PLANNER_MIN_PEOPLE,
} from '../lib/cateringPlanner';
import { CATERING_MIN_SUBTOTAL, servesLabel } from '../lib/catering';
import { tabularNums } from '../lib/typography';

const QUICK_COUNTS = [10, 20, 30, 50];

// "Feeding [ 15 ] people" -> the packages to order. Each suggestion opens
// the package with its quantity already set, since boards still need their
// sandwiches chosen.
export default function CateringPlanner({ packages }: { packages: PlannerPackage[] }) {
  const router = useRouter();
  const cartItems = useCartStore((state) => state.items);
  const [people, setPeople] = useState(PLANNER_DEFAULT_PEOPLE);
  const plan = useMemo(() => planCatering(people, packages), [people, packages]);

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
          <Text className="text-[11px] text-[#78716C]">
            {detail} • ${(Number(pkg.base_price) * quantity).toFixed(2)}
          </Text>
        </View>
        {added ? (
          <View className="flex-row items-center px-2.5 py-1.5">
            <Ionicons name="checkmark-circle" size={16} color="#047857" />
            <Text className="text-emerald-800 text-xs font-inter-bold ml-1">In Cart</Text>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/(main)/item/[id]', params: { id: pkg.id, qty: String(quantity) } })}
            className="bg-[#A61C14] px-3.5 py-1.5 rounded-lg active:bg-[#85140E]"
          >
            <Text className="text-[#F4ECE1] text-xs font-inter-bold">Choose</Text>
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
            <Text className={`text-xs font-inter-bold ${people === n ? 'text-[#F4ECE1]' : 'text-[#1C1917]'}`}>{n}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text className="text-[11px] font-inter-bold uppercase tracking-wider text-stone-500 mt-1">We Suggest</Text>
      {plan.mains.map((line) =>
        renderLine(line, line.pkg.serves_min ? servesLabel(line.pkg.serves_min, line.pkg.serves_max) : '')
      )}
      {plan.drinks.map((line) =>
        renderLine(line, `${(line.pkg.serves_max ?? line.pkg.serves_min ?? 0) * line.quantity} drinks`)
      )}

      <View className="flex-row justify-between items-center mt-2.5">
        <Text className="text-xs text-[#78716C] flex-1 mr-2">
          Feeds up to {plan.mainsServe}. Add sides or dessert from the list below.
        </Text>
        <Text className="text-sm font-inter-bold text-[#1C1917]" style={tabularNums}>
          ~${plan.total.toFixed(2)}
        </Text>
      </View>
      {plan.total < CATERING_MIN_SUBTOTAL && (
        <Text className="text-[11px] text-[#A61C14] mt-1">
          Catering has a ${CATERING_MIN_SUBTOTAL} minimum -- add a side or dessert to reach it.
        </Text>
      )}
    </View>
  );
}
