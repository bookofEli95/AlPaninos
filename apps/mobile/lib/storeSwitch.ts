import { Alert } from 'react-native';
import { supabase } from './supabase';
import { CartItem, CartModifier, useCartStore } from '../store/cartStore';
import { useLocationStore } from '../store/locationStore';
import { isDropOrderable } from './drops';

// Switching stores with things in the cart. Every store has its own copy of
// the menu (its own item and option ids), so a cart is moved by matching
// each item -- and each of its options -- by name at the new store and
// re-pricing it there. Anything the new store doesn't sell is left behind,
// and the customer is asked first.

const key = (...parts: (string | null | undefined)[]) => parts.map((p) => (p ?? '').trim().toLowerCase()).join('|');

type MovePlan = { moved: CartItem[]; removed: string[] };

async function planCartMove(items: CartItem[], toLocationId: string): Promise<MovePlan> {
  const sourceItemIds = Array.from(new Set(items.map((i) => i.menuItemId)));
  const sourceOptionIds = Array.from(new Set(items.flatMap((i) => i.modifiers.map((m) => m.optionId))));

  const [sourceItemsRes, sourceOptionsRes, targetItemsRes] = await Promise.all([
    (supabase as any).from('menu_items').select('id, name, menu_categories(name)').in('id', sourceItemIds),
    sourceOptionIds.length
      ? (supabase as any).from('modifier_options').select('id, name, modifier_groups!group_id(name)').in('id', sourceOptionIds)
      : Promise.resolve({ data: [], error: null }),
    (supabase as any)
      .from('menu_items')
      .select('*, menu_categories(name)')
      .eq('location_id', toLocationId)
      .eq('is_available', true),
  ]);
  for (const res of [sourceItemsRes, sourceOptionsRes, targetItemsRes]) {
    if (res.error) throw res.error;
  }

  // "category|item name" -> this store's item.
  const sourceItemKey = new Map<string, string>(
    (sourceItemsRes.data || []).map((m: any) => [m.id, key(m.menu_categories?.name, m.name)])
  );
  const targetByKey = new Map<string, any>(
    (targetItemsRes.data || [])
      .filter((m: any) => isDropOrderable(m))
      .map((m: any) => [key(m.menu_categories?.name, m.name), m])
  );
  // option id -> "group|option name".
  const sourceOptionKey = new Map<string, string>(
    (sourceOptionsRes.data || []).map((o: any) => [o.id, key(o.modifier_groups?.name, o.name)])
  );

  // The new store's options for the items being moved, by "group|option".
  const matchedTargetIds = items
    .map((i) => targetByKey.get(sourceItemKey.get(i.menuItemId) ?? '')?.id)
    .filter(Boolean);
  const targetOptionsByItem = new Map<string, Map<string, any>>();
  if (matchedTargetIds.length && sourceOptionIds.length) {
    const { data: groups, error } = await (supabase as any)
      .from('modifier_groups')
      .select('id, name, menu_item_id, modifier_options!modifier_options_group_id_fkey(id, name, price_adjustment)')
      .in('menu_item_id', matchedTargetIds);
    if (error) throw error;
    (groups || []).forEach((g: any) => {
      const byKey = targetOptionsByItem.get(g.menu_item_id) ?? new Map<string, any>();
      (g.modifier_options || []).forEach((o: any) => byKey.set(key(g.name, o.name), o));
      targetOptionsByItem.set(g.menu_item_id, byKey);
    });
  }

  const moved: CartItem[] = [];
  const removed: string[] = [];
  for (const item of items) {
    const target = targetByKey.get(sourceItemKey.get(item.menuItemId) ?? '');
    if (!target) {
      removed.push(item.name);
      continue;
    }

    // Every option has to exist there too -- quietly dropping "No Bacon"
    // would change the order.
    const options = targetOptionsByItem.get(target.id);
    const modifiers: CartModifier[] = [];
    let allFound = true;
    for (const mod of item.modifiers) {
      const option = options?.get(sourceOptionKey.get(mod.optionId) ?? '');
      if (!option) {
        allFound = false;
        break;
      }
      modifiers.push({ optionId: option.id, name: option.name, price: Number(option.price_adjustment) });
    }
    if (!allFound) {
      removed.push(item.name);
      continue;
    }

    const basePrice = Number(target.base_price);
    const unitPrice = basePrice + modifiers.reduce((sum, m) => sum + m.price, 0);
    moved.push({
      ...item,
      menuItemId: target.id,
      name: target.name,
      basePrice,
      modifiers,
      imageUrl: target.image_url ?? item.imageUrl,
      // A reward line stays free.
      totalPrice: item.promoCode ? 0 : unitPrice * item.quantity,
    });
  }
  return { moved, removed };
}

const confirm = (title: string, message: string, action: string) =>
  new Promise<boolean>((resolve) =>
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: action, onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    )
  );

// Makes `toLocationId` the store being ordered from, bringing the cart
// along. Resolves false if the customer cancelled (nothing changed).
export async function switchStore(toLocationId: string, toLocationName?: string | null): Promise<boolean> {
  const cart = useCartStore.getState();
  const setLocationId = useLocationStore.getState().setLocationId;

  if (cart.items.length === 0 || !cart.locationId || cart.locationId === toLocationId) {
    setLocationId(toLocationId);
    return true;
  }

  let plan: MovePlan;
  try {
    plan = await planCartMove(cart.items, toLocationId);
  } catch (e: any) {
    Alert.alert("Couldn't switch stores", e.message);
    return false;
  }

  const storeName = toLocationName || 'this store';
  if (plan.removed.length > 0) {
    const everything = plan.moved.length === 0;
    const ok = await confirm(
      `Switch to ${storeName}?`,
      everything
        ? `Nothing in your cart is available at ${storeName}, so your cart will be emptied.`
        : `${plan.removed.length === 1 ? "This isn't" : "These aren't"} available at ${storeName} and will be removed:\n\n${plan.removed.join('\n')}`,
      'Switch'
    );
    if (!ok) return false;
  }

  useCartStore.getState().replaceCart(plan.moved, toLocationId);
  setLocationId(toLocationId);
  return true;
}
