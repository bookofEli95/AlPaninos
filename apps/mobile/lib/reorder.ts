import { supabase } from './supabase';
import { useCartStore, CartItem } from '../store/cartStore';

export type ReorderResult = {
  locationId: string;
  skippedCount: number;
};

// Rebuilds the cart from a past order's items, skipping any that are no
// longer available (discontinued item, etc.) and reporting how many were
// skipped so the caller can tell the customer.
export async function reorderFromOrder(orderId: string): Promise<ReorderResult> {
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('location_id, order_type, delivery_address')
    .eq('id', orderId)
    .single();
  if (orderError) throw orderError;

  const { data: orderItems, error: itemsError } = await (supabase as any)
    .from('order_items')
    .select(`
      menu_item_id,
      quantity,
      unit_price,
      total_price,
      special_instructions,
      menu_items ( name, is_available, image_url ),
      order_item_modifiers (
        modifier_option_id,
        price_adjustment,
        modifier_options ( name )
      )
    `)
    .eq('order_id', orderId);
  if (itemsError) throw itemsError;

  const cartStore = useCartStore.getState();
  cartStore.clearCart();
  cartStore.setOrderType(order.order_type);
  if (order.delivery_address) cartStore.setDeliveryAddress(order.delivery_address);

  let skippedCount = 0;
  (orderItems || []).forEach((oi: any) => {
    if (!oi.menu_items?.is_available) {
      skippedCount++;
      return;
    }

    const modifiers = (oi.order_item_modifiers || []).map((m: any) => ({
      optionId: m.modifier_option_id,
      name: m.modifier_options?.name ?? '',
      price: m.price_adjustment,
    }));

    // Recomputed rather than trusting oi.total_price -- a reorder charges
    // the item's normal price even if the original order redeemed it for
    // free via a wheel prize/PaninoPoints reward (that reward was already
    // spent and reordering doesn't imply redeeming another one).
    const cartItem: CartItem = {
      cartItemId: Math.random().toString(36).substr(2, 9),
      menuItemId: oi.menu_item_id,
      name: oi.menu_items?.name ?? 'Item',
      basePrice: oi.unit_price,
      quantity: oi.quantity,
      modifiers,
      totalPrice: (oi.unit_price + modifiers.reduce((sum: number, m: any) => sum + m.price, 0)) * oi.quantity,
      specialInstructions: oi.special_instructions || undefined,
      imageUrl: oi.menu_items?.image_url,
    };

    useCartStore.getState().addItem(cartItem, order.location_id);
  });

  return { locationId: order.location_id, skippedCount };
}

export type UsualItemResult = {
  locationId: string;
  skipped: boolean;
};

// Adds "Your Usual" (index.tsx) to the cart, cloning the modifiers from the
// customer's most recent order of that item rather than just the bare item --
// closer to what "the usual" actually means.
export async function reorderUsualItem(menuItemId: string): Promise<UsualItemResult> {
  const { data: menuItem, error: itemError } = await supabase
    .from('menu_items')
    .select('id, name, base_price, location_id, is_available, image_url')
    .eq('id', menuItemId)
    .single();
  if (itemError) throw itemError;

  if (!menuItem.is_available) {
    return { locationId: menuItem.location_id, skipped: true };
  }

  const { data: lastOrderItem, error: lastError } = await (supabase as any)
    .from('order_items')
    .select(`
      unit_price,
      special_instructions,
      order_item_modifiers (
        modifier_option_id,
        price_adjustment,
        modifier_options ( name )
      ),
      orders!inner ( created_at )
    `)
    .eq('menu_item_id', menuItemId)
    .order('created_at', { ascending: false, referencedTable: 'orders' })
    .limit(1)
    .maybeSingle();
  if (lastError) throw lastError;

  const unitPrice = lastOrderItem?.unit_price ?? menuItem.base_price;
  const modifiers = (lastOrderItem?.order_item_modifiers || []).map((m: any) => ({
    optionId: m.modifier_option_id,
    name: m.modifier_options?.name ?? '',
    price: m.price_adjustment,
  }));

  const cartItem: CartItem = {
    cartItemId: Math.random().toString(36).substr(2, 9),
    menuItemId: menuItem.id,
    name: menuItem.name,
    basePrice: unitPrice,
    quantity: 1,
    modifiers,
    totalPrice: unitPrice + modifiers.reduce((sum: number, m: any) => sum + m.price, 0),
    specialInstructions: lastOrderItem?.special_instructions || undefined,
    imageUrl: menuItem.image_url,
  };

  useCartStore.getState().addItem(cartItem, menuItem.location_id);
  return { locationId: menuItem.location_id, skipped: false };
}
