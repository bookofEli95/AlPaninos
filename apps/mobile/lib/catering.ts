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

export type CateringDay = {
  date: Date;
  // "Tomorrow, Fri, Sep 25" / "Sat, Sep 26" -- the selected day's heading.
  label: string;
  // "Fri" and "25" for the calendar tile.
  weekday: string;
  dayNumber: string;
  // The store's hours that day, e.g. "11:00 AM - 4:00 PM"; null when closed.
  hoursLabel: string | null;
  closed: boolean;
  slots: PickupSlot[];
};

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

// Every calendar day in the booking window, starting from the earliest one
// allowed, straight off the store's own hours for that weekday: open days
// get 30-minute slots from opening until 30 minutes before closing (the
// order has to be handed over before the doors shut); days the store is
// closed are still listed, marked closed, so the picker reads as a real
// calendar rather than silently skipping dates.
export function getCateringDays(hours: WeekHours | null | undefined, now: Date = new Date()): CateringDay[] {
  if (!hours) return [];
  const first = earliestCateringDate(now);
  const days: CateringDay[] = [];

  for (let i = 0; i < CATERING_BOOKING_DAYS; i++) {
    const date = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i);
    const dayHours = hours[DAY_NAMES[date.getDay()]];
    const base = {
      date,
      label: dayLabel(date, now),
      weekday: date.toLocaleDateString([], { weekday: 'short' }),
      dayNumber: String(date.getDate()),
    };

    if (!dayHours) {
      days.push({ ...base, hoursLabel: null, closed: true, slots: [] });
      continue;
    }

    const [openH, openM] = dayHours.open.split(':').map(Number);
    const [closeH, closeM] = dayHours.close.split(':').map(Number);
    const openAt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), openH, openM);
    const closeAt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), closeH, closeM);
    const lastSlot = new Date(closeAt.getTime() - CATERING_SLOT_INTERVAL_MINUTES * 60000);

    const slots: PickupSlot[] = [];
    for (let t = new Date(openAt); t <= lastSlot; t = new Date(t.getTime() + CATERING_SLOT_INTERVAL_MINUTES * 60000)) {
      slots.push({ time: t, label: formatSlotTime(t) });
    }
    days.push({
      ...base,
      hoursLabel: `${formatSlotTime(openAt)} - ${formatSlotTime(closeAt)}`,
      closed: slots.length === 0,
      slots,
    });
  }
  return days;
}
