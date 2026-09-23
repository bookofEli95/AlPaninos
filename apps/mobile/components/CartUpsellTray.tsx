import { useMemo } from 'react';
import { View, Text, TouchableOpacity, Image, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import { useCartStore, CartItem } from '../store/cartStore';

type UpsellItem = { id: string; name: string; base_price: number; image_url: string | null; hasModifiers: boolean };

// Curated by name rather than by category (Extras also holds non-sauce
// add-ons like Side Grilled Chicken; Sides also holds salads) -- same
// pattern as promoEligibility.ts's item_name_patterns, and just as tolerant
// of the item being renamed or 86'd: it simply stops matching instead of
// breaking. Order here is display order within each tray.
const DUNK_IT_PATTERNS = ['Side Paninos Fancy Sauce', 'Side Garlic Aioli', 'Side Tzatziki', 'Side Hot Sauce'];
const MEAL_PATTERNS = ['Fries', 'Greek Fries', 'Philly Fries', 'Fries N Gravy', 'Pulled Pork Fries'];
const SWEET_FINISH_PATTERNS = ["Al's Tiramisu", "Al's Toasted Coconut Cheesecake"];
const SANDWICH_CATEGORY_NAMES = ['The Mob', "Al's Wraps"];

function normalize(name: string) {
  return name.trim().toLowerCase();
}

type Bucket = { key: string; title: string; items: UpsellItem[] };

export default function CartUpsellTray({
  items,
  locationId,
  cartTotal,
}: {
  items: CartItem[];
  locationId: string;
  cartTotal: number;
}) {
  const router = useRouter();
  const cartItems = useCartStore((state) => state.items);
  const incrementSimpleItemRaw = useCartStore((state) => state.incrementSimpleItem);
  const decrementSimpleItemRaw = useCartStore((state) => state.decrementSimpleItem);

  const incrementSimpleItem: typeof incrementSimpleItemRaw = (...args) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    incrementSimpleItemRaw(...args);
  };
  const decrementSimpleItem: typeof decrementSimpleItemRaw = (...args) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    decrementSimpleItemRaw(...args);
  };

  const { data: catalog } = useQuery({
    queryKey: ['upsellCatalog', locationId],
    queryFn: async () => {
      const { data: categories, error: catError } = await supabase
        .from('menu_categories')
        .select('id, name')
        .eq('location_id', locationId)
        .in('name', ['Sides', 'Extras', 'Drinks', ...SANDWICH_CATEGORY_NAMES]);
      if (catError) throw catError;

      const categoryNameById = Object.fromEntries((categories || []).map((c) => [c.id, c.name]));

      const { data: menuItems, error: itemsError } = await supabase
        .from('menu_items')
        .select('id, name, base_price, image_url, is_available, category_id')
        .eq('location_id', locationId)
        .eq('is_available', true)
        .in('category_id', (categories || []).map((c) => c.id));
      if (itemsError) throw itemsError;

      // Greek Fries/Philly Fries/Pulled Pork Fries have real topping
      // modifier groups; a plain one-tap add would silently skip them
      // instead of letting the customer pick toppings. Flagging which
      // items actually have any group lets the render below send those to
      // the same item-detail customization screen every other modifier-
      // bearing item already uses, instead of building a second picker UI
      // just for this tray.
      const itemIds = (menuItems || []).map((m: any) => m.id);
      const { data: groupRows, error: groupsError } = await supabase
        .from('modifier_groups')
        .select('menu_item_id')
        .in('menu_item_id', itemIds);
      if (groupsError) throw groupsError;
      const itemIdsWithModifiers = new Set((groupRows || []).map((g: any) => g.menu_item_id));

      return {
        categoryNameByItemId: Object.fromEntries(
          (menuItems || []).map((m: any) => [m.id, categoryNameById[m.category_id]])
        ) as Record<string, string>,
        itemsByName: Object.fromEntries(
          (menuItems || []).map((m: any) => [
            normalize(m.name),
            { ...m, hasModifiers: itemIdsWithModifiers.has(m.id) },
          ])
        ) as Record<string, UpsellItem>,
      };
    },
    enabled: !!locationId,
  });

  const buckets: Bucket[] = useMemo(() => {
    if (!catalog) return [];

    const findAvailable = (patterns: string[]): UpsellItem[] =>
      patterns
        .map((p) => catalog.itemsByName[normalize(p)])
        .filter((m): m is UpsellItem => !!m);

    const hasByPattern = (patterns: string[]) =>
      items.some((i) => patterns.some((p) => normalize(p) === normalize(i.name)));

    const hasSandwich = items.some((i) => SANDWICH_CATEGORY_NAMES.includes(catalog.categoryNameByItemId[i.menuItemId]));
    const hasDrink = items.some((i) => catalog.categoryNameByItemId[i.menuItemId] === 'Drinks');
    const hasMealSide = hasByPattern(MEAL_PATTERNS);

    const result: Bucket[] = [];
    if (!hasMealSide && !hasDrink) {
      const meal = findAvailable(MEAL_PATTERNS).slice(0, 3);
      if (meal.length > 0) result.push({ key: 'meal', title: 'Make It a Meal', items: meal });
    }
    // Dunk It and Sweet Finish stay put once triggered, rather than
    // vanishing the moment their item lands in the cart -- otherwise the
    // only way to adjust quantity or add a second flavor is to scroll up
    // and use the cart line's Remove link and start over. Make It a Meal
    // is left as before (hides once satisfied) since the user only asked
    // for the "stays visible" treatment on these two.
    if (hasSandwich) {
      const dips = findAvailable(DUNK_IT_PATTERNS);
      if (dips.length > 0) result.push({ key: 'dunk', title: 'Dunk It', items: dips });
    }
    if (cartTotal > 20) {
      const sweets = findAvailable(SWEET_FINISH_PATTERNS);
      if (sweets.length > 0) result.push({ key: 'sweet', title: 'Sweet Finish', items: sweets });
    }
    return result;
  }, [catalog, items, cartTotal]);

  if (buckets.length === 0) return null;

  return (
    <View className="mt-2 mb-2">
      {buckets.map((bucket) => (
        <View key={bucket.key} className="mb-4">
          <Text className="text-base font-inter-bold text-[#1C1917] mb-2">{bucket.title}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 8 }}>
            {bucket.items.map((upsellItem) => {
              const qty =
                cartItems.find((i) => i.menuItemId === upsellItem.id && i.modifiers.length === 0)?.quantity || 0;
              return (
                <View
                  key={upsellItem.id}
                  className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden mr-3"
                  style={{ width: 128 }}
                >
                  {upsellItem.image_url ? (
                    <Image source={{ uri: upsellItem.image_url }} className="w-full h-20 bg-stone-200" resizeMode="cover" />
                  ) : (
                    <View className="w-full h-20 bg-[#FAF6F0] items-center justify-center" />
                  )}
                  <View className="p-2.5">
                    <Text className="text-[#1C1917] font-inter-semibold text-xs" numberOfLines={2}>
                      {upsellItem.name}
                    </Text>
                    <Text className="text-[#A61C14] font-inter-bold text-xs mt-1 mb-2">
                      +${upsellItem.base_price.toFixed(2)}
                    </Text>
                    {upsellItem.hasModifiers ? (
                      <TouchableOpacity
                        onPress={() =>
                          router.push({ pathname: `/(main)/item/${upsellItem.id}`, params: { returnTo: 'cart' } })
                        }
                        className="bg-[#A61C14] rounded-lg py-1.5 items-center active:bg-[#85140E]"
                      >
                        <Text className="text-[#F4ECE1] font-inter-bold text-xs">Customize</Text>
                      </TouchableOpacity>
                    ) : qty === 0 ? (
                      <TouchableOpacity
                        onPress={() =>
                          incrementSimpleItem(
                            { menuItemId: upsellItem.id, name: upsellItem.name, basePrice: upsellItem.base_price },
                            locationId
                          )
                        }
                        className="bg-[#A61C14] rounded-lg py-1.5 items-center active:bg-[#85140E]"
                      >
                        <Text className="text-[#F4ECE1] font-inter-bold text-xs">Add</Text>
                      </TouchableOpacity>
                    ) : (
                      <View className="flex-row items-center justify-between bg-stone-100 rounded-lg px-1 py-1 border border-stone-200">
                        <TouchableOpacity
                          onPress={() => decrementSimpleItem(upsellItem.id)}
                          className="bg-white w-6 h-6 rounded-md items-center justify-center shadow-sm"
                        >
                          <Text className="font-inter-bold text-[#1C1917] text-xs">-</Text>
                        </TouchableOpacity>
                        <Text className="font-inter-bold text-[#1C1917] text-xs">{qty}</Text>
                        <TouchableOpacity
                          onPress={() =>
                            incrementSimpleItem(
                              { menuItemId: upsellItem.id, name: upsellItem.name, basePrice: upsellItem.base_price },
                              locationId
                            )
                          }
                          className="bg-white w-6 h-6 rounded-md items-center justify-center shadow-sm"
                        >
                          <Text className="font-inter-bold text-[#1C1917] text-xs">+</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      ))}
    </View>
  );
}
