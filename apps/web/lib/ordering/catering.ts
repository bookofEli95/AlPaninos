import { DAY_NAMES, type WeekHours } from "@/lib/hours";
import { formatSlotTime, storeDate, storeDayStart, storeParts, type Slot } from "./timing";

// Catering rules -- the same as the app's lib/catering.ts and the
// place_order() checks in the database, on the store's clock. No minimum
// order.

// "Order by 6 PM for the next day."
export const CATERING_CUTOFF_HOUR = 18;
export const CATERING_MAX_DELIVERY_KM = 60;
const CATERING_BOOKING_DAYS = 14;
const CATERING_SLOT_MINUTES = 30;

export const CATERING_RULES_SUMMARY = "Order by 6 PM for next-day pickup or delivery. No minimum.";

// "Serves 8-10", or "Serves 12" when both ends match.
export function servesLabel(min: number, max?: number | null): string {
  return max && max !== min ? `Serves ${min}-${max}` : `Serves ${min}`;
}

// Midnight (store clock) of the earliest day a catering order can be for.
export function earliestCateringDate(now: Date = new Date()): Date {
  return storeDayStart(now, storeParts(now).hour < CATERING_CUTOFF_HOUR ? 1 : 2);
}

export function isCateringSlotAllowed(slot: Date, now: Date = new Date()): boolean {
  return slot.getTime() >= earliestCateringDate(now).getTime();
}

export type CateringDay = {
  key: string;
  weekday: string;
  dayNumber: string;
  month: string;
  label: string;
  hoursLabel: string | null;
  closed: boolean;
  slots: Slot[];
};

const weekdayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", weekday: "short" });
const monthFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", month: "short" });
const labelFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", weekday: "long", month: "long", day: "numeric" });

// Every day in the booking window from the earliest allowed, closed days
// included (marked) so the picker reads as a real calendar. Open days get
// 30-minute slots from opening until 30 minutes before closing.
export function getCateringDays(hours: WeekHours | null | undefined, now: Date = new Date()): CateringDay[] {
  if (!hours) return [];
  const first = storeParts(earliestCateringDate(now));
  const days: CateringDay[] = [];
  for (let i = 0; i < CATERING_BOOKING_DAYS; i++) {
    const date = storeDate(first.year, first.month, first.day + i);
    const p = storeParts(date);
    const dayHours = hours[DAY_NAMES[p.dayIndex]];
    const base = {
      key: date.toISOString(),
      weekday: weekdayFmt.format(date),
      dayNumber: String(p.day),
      month: monthFmt.format(date),
      label: labelFmt.format(date),
    };
    if (!dayHours) {
      days.push({ ...base, hoursLabel: null, closed: true, slots: [] });
      continue;
    }
    const [openH, openM] = dayHours.open.split(":").map(Number);
    const [closeH, closeM] = dayHours.close.split(":").map(Number);
    const openAt = storeDate(p.year, p.month, p.day, openH, openM);
    const closeAt = storeDate(p.year, p.month, p.day, closeH, closeM);
    const slots: Slot[] = [];
    for (let t = openAt.getTime(); t <= closeAt.getTime() - CATERING_SLOT_MINUTES * 60000; t += CATERING_SLOT_MINUTES * 60000) {
      slots.push({ time: new Date(t), label: formatSlotTime(new Date(t)) });
    }
    days.push({ ...base, hoursLabel: `${formatSlotTime(openAt)} - ${formatSlotTime(closeAt)}`, closed: slots.length === 0, slots });
  }
  return days;
}
