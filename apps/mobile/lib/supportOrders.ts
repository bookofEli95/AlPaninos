import { formatSlotTime } from './orderTiming';

// Customer Support's "Which order is this about?" list: each recent order
// as the customer would recognise it -- what was in it, and when.

type OrderLine = { quantity: number; menu_items?: { name?: string | null } | null };

// "Lucky Looch, 2x Pepsi +1 more" -- the same summary the Orders tab shows.
export function orderItemsSummary(lines: OrderLine[]): string {
  const names = lines.map((l) => `${l.quantity > 1 ? `${l.quantity}x ` : ''}${l.menu_items?.name ?? 'Item'}`);
  return names.slice(0, 2).join(', ') + (names.length > 2 ? ` +${names.length - 2} more` : '');
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// When it was for: "Today, 6:42 PM", "Yesterday, 12:05 PM", "Tomorrow,
// 11:30 AM" (a scheduled order), then just the day -- "Sat, Sep 27" --
// and the year once it's a different one: "Dec 14, 2025".
export function orderWhenLabel(date: Date, now: Date = new Date()): string {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(date) - startOfDay(now)) / 86400000);
  const time = formatSlotTime(date);
  if (dayDiff === 0) return `Today, ${time}`;
  if (dayDiff === -1) return `Yesterday, ${time}`;
  if (dayDiff === 1) return `Tomorrow, ${time}`;
  const day = `${MONTHS[date.getMonth()]} ${date.getDate()}`;
  return date.getFullYear() === now.getFullYear() ? `${WEEKDAYS[date.getDay()]}, ${day}` : `${day}, ${date.getFullYear()}`;
}

// The line under the summary: "Today, 6:42 PM · Pickup · $24.50". A
// scheduled order goes by the time it was for, not when it was placed.
export function orderPickSubtitle(
  order: {
    created_at: string;
    requested_ready_at?: string | null;
    order_type?: string | null;
    is_catering?: boolean | null;
    total_amount: number | string;
  },
  now: Date = new Date()
): string {
  const when = orderWhenLabel(new Date(order.requested_ready_at || order.created_at), now);
  const kind = order.is_catering ? 'Catering' : order.order_type === 'delivery' ? 'Delivery' : 'Pickup';
  return `${when} · ${kind} · $${Number(order.total_amount).toFixed(2)}`;
}
