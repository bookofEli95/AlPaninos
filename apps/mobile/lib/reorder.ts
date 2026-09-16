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
      menu_items ( name, is_available ),
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

    const cartItem: CartItem = {
      cartItemId: Math.random().toString(36).substr(2, 9),
      menuItemId: oi.menu_item_id,
      name: oi.menu_items?.name ?? 'Item',
      basePrice: oi.unit_price,
      quantity: oi.quantity,
      modifiers: (oi.order_item_modifiers || []).map((m: any) => ({
        optionId: m.modifier_option_id,
        name: m.modifier_options?.name ?? '',
        price: m.price_adjustment,
      })),
      totalPrice: oi.total_price,
      specialInstructions: oi.special_instructions || undefined,
    };

    useCartStore.getState().addItem(cartItem, order.location_id);
  });

  return { locationId: order.location_id, skippedCount };
}
