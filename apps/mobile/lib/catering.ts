import { WeekHours } from './hours';
import { DAY_NAMES, PickupSlot, formatSlotTime } from './orderTiming';

// Catering (phase 1) rules -- see the catering migration. Kept in one place
// so the cart, item screen and menu all describe the same thing.

// Minimum subtotal *after* discounts, before tax.
export const CATERING_MIN_SUBTOTAL = 100;
// "Order by 6 PM for the next day": before this hour, tomorrow is the
// earliest day; from this hour on, the day after tomorrow.
export const CATERING_CUTOFF_HOUR = 18;
export const CATERING_MAX_DELIVERY_KM = 60;
// How far ahead the day picker offers.
export const CATERING_BOOKING_DAYS = 14;
const CATERING_SLOT_INTERVAL_MINUTES = 30;

export const CATERING_RULES_SUMMARY = `Order by 6 PM for next-day pickup or delivery. $${CATERING_MIN_SUBTOTAL} minimum.`;

// "Serves 8-10", or "Serves 12" when both ends match.
export function servesLabel(min: number, max?: number | null): string {
  return max && max !== min ? `Serves ${min}-${max}` : `Serves ${min}`;
}

export type CateringDay = { date: Date; label: string; slots: PickupSlot[] };

// Midnight at the start of the earliest day a catering order can be for.
export function earliestCateringDate(now: Date = new Date()): Date {
  const daysAhead = now.getHours() < CATERING_CUTOFF_HOUR ? 1 : 2;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysAhead);
}

export function isCateringSlotAllowed(slot: Date, now: Date = new Date()): boolean {
  return slot.getTime() >= earliestCateringDate(now).getTime();
}

function dayLabel(date: Date, now: Date): string {
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const short = date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  return date.getTime() === tomorrow.getTime() ? `Tomorrow, ${short}` : short;
}

// Every bookable day from the earliest allowed one, skipping days the store
// is closed, each with 30-minute slots from opening until 30 minutes before
// closing (the order has to be handed over before the doors shut).
export function getCateringDays(hours: WeekHours | null | undefined, now: Date = new Date()): CateringDay[] {
  if (!hours) return [];
  const first = earliestCateringDate(now);
  const days: CateringDay[] = [];

  for (let i = 0; i < CATERING_BOOKING_DAYS; i++) {
    const date = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i);
    const dayHours = hours[DAY_NAMES[date.getDay()]];
    if (!dayHours) continue;

    const [openH, openM] = dayHours.open.split(':').map(Number);
    const [closeH, closeM] = dayHours.close.split(':').map(Number);
    const openAt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), openH, openM);
    const lastSlot = new Date(date.getFullYear(), date.getMonth(), date.getDate(), closeH, closeM - CATERING_SLOT_INTERVAL_MINUTES);

    const slots: PickupSlot[] = [];
    for (let t = new Date(openAt); t <= lastSlot; t = new Date(t.getTime() + CATERING_SLOT_INTERVAL_MINUTES * 60000)) {
      slots.push({ time: t, label: formatSlotTime(t) });
    }
    if (slots.length > 0) days.push({ date, label: dayLabel(date, now), slots });
  }
  return days;
}
