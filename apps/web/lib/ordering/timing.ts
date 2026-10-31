import { DAY_NAMES, type WeekHours } from "@/lib/hours";

// When an order can be ready -- the app's lib/orderTiming.ts, but always on
// the stores' own clock (Ontario), so someone ordering from another time
// zone still sees the store's real hours. The database checks the same
// thing again when the order is placed (check_order_within_hours).

const STORE_TIME_ZONE = "America/Toronto";
const SLOT_INTERVAL_MINUTES = 15;

type Parts = { year: number; month: number; day: number; hour: number; minute: number; dayIndex: number };

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: STORE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
  hourCycle: "h23",
});

// A moment as the date and time on the store's clock (month is 0-based).
export function storeParts(date: Date): Parts {
  const parts = partsFormatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return {
    year: Number(get("year")),
    month: Number(get("month")) - 1,
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    dayIndex: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday").slice(0, 3)),
  };
}

// The moment it is a given date and time on the store's clock. Day
// overflow (day 32) rolls into the next month, like new Date() does.
export function storeDate(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  const wanted = Date.UTC(year, month, day, hour, minute);
  let guess = wanted;
  // Two passes settle it, daylight saving changes included.
  for (let i = 0; i < 2; i++) {
    const p = storeParts(new Date(guess));
    const shown = Date.UTC(p.year, p.month, p.day, p.hour, p.minute);
    guess += wanted - shown;
  }
  return new Date(guess);
}

// Midnight on the store's clock, `ahead` days from the day `now` is in.
export function storeDayStart(now: Date, ahead = 0): Date {
  const p = storeParts(now);
  return storeDate(p.year, p.month, p.day + ahead);
}

export function estimateReadyMinutes(orderType: "pickup" | "delivery", itemCount: number, rushMinutes = 0): number {
  const base = orderType === "delivery" ? 35 : 20;
  const extra = Math.min(Math.max(itemCount - 1, 0) * 2, 20);
  return base + extra + rushMinutes;
}

export function formatSlotTime(date: Date): string {
  const { hour, minute } = storeParts(date);
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

// The store's opening and closing on the day a moment falls on (store clock).
function hoursOn(hours: WeekHours, date: Date): { openAt: Date; closeAt: Date } | null {
  const p = storeParts(date);
  const day = hours[DAY_NAMES[p.dayIndex]];
  if (!day) return null;
  const [openH, openM] = day.open.split(":").map(Number);
  const [closeH, closeM] = day.close.split(":").map(Number);
  return {
    openAt: storeDate(p.year, p.month, p.day, openH, openM),
    closeAt: storeDate(p.year, p.month, p.day, closeH, closeM),
  };
}

// Whether an order can be made right now ("ASAP"): open, and able to be
// ready before closing. No hours on file counts as open.
export function canOrderAsap(
  hours: WeekHours | null | undefined,
  orderType: "pickup" | "delivery",
  itemCount: number,
  rushMinutes = 0,
  now: Date = new Date()
): boolean {
  if (!hours) return true;
  const today = hoursOn(hours, now);
  if (!today) return false;
  const readyAt = now.getTime() + estimateReadyMinutes(orderType, itemCount, rushMinutes) * 60000;
  return now >= today.openAt && now < today.closeAt && readyAt <= today.closeAt.getTime();
}

export type Slot = { time: Date; label: string };
export type OrderDay = { key: string; label: string; slots: Slot[] };

// Every time an order can be ready for, by day: the rest of today and the
// next days the store opens (three days with times), every 15 minutes from
// the earliest the kitchen could have it ready until closing.
export function getOrderDays(
  hours: WeekHours | null | undefined,
  orderType: "pickup" | "delivery",
  itemCount: number,
  rushMinutes = 0,
  now: Date = new Date()
): OrderDay[] {
  if (!hours) return [];
  const prepMs = estimateReadyMinutes(orderType, itemCount, rushMinutes) * 60000;
  const days: OrderDay[] = [];
  for (let ahead = 0; ahead < 8 && days.length < 3; ahead++) {
    const dayStart = storeDayStart(now, ahead);
    const open = hoursOn(hours, new Date(dayStart.getTime() + 12 * 3600000));
    if (!open) continue;
    const earliestMs = Math.max(now.getTime(), open.openAt.getTime()) + prepMs;
    const step = SLOT_INTERVAL_MINUTES * 60000;
    // Round up to the next quarter hour (store and UTC quarter hours line up).
    const first = Math.ceil(earliestMs / step) * step;
    const slots: Slot[] = [];
    for (let t = first; t <= open.closeAt.getTime(); t += step) {
      const time = new Date(t);
      slots.push({ time, label: formatSlotTime(time) });
    }
    if (!slots.length) continue;
    days.push({ key: dayStart.toISOString(), label: dayLabel(dayStart, now), slots });
  }
  return days;
}

export function isOrderTimeAvailable(
  time: Date,
  hours: WeekHours | null | undefined,
  orderType: "pickup" | "delivery",
  itemCount: number,
  rushMinutes = 0,
  now: Date = new Date()
): boolean {
  if (time.getTime() < now.getTime() + estimateReadyMinutes(orderType, itemCount, rushMinutes) * 60000 - 60000) return false;
  if (!hours) return true;
  const day = hoursOn(hours, time);
  return !!day && time >= day.openAt && time <= day.closeAt;
}

const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: STORE_TIME_ZONE, weekday: "long", month: "short", day: "numeric" });
const shortDayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: STORE_TIME_ZONE, weekday: "short", month: "short", day: "numeric" });

function daysBetween(a: Date, b: Date): number {
  const pa = storeParts(a);
  const pb = storeParts(b);
  return Math.round((Date.UTC(pa.year, pa.month, pa.day) - Date.UTC(pb.year, pb.month, pb.day)) / 86400000);
}

// "Today", "Tomorrow", otherwise "Saturday, Nov 1".
export function dayLabel(date: Date, now: Date = new Date()): string {
  const diff = daysBetween(date, now);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return dayFormatter.format(date);
}

// "at 11:30 AM" today, "tomorrow at 11:30 AM", else "Sat, Nov 1 at 11:30 AM".
export function formatDayAndTime(date: Date, now: Date = new Date()): string {
  const time = formatSlotTime(date);
  const diff = daysBetween(date, now);
  if (diff === 0) return `at ${time}`;
  if (diff === 1) return `tomorrow at ${time}`;
  return `${shortDayFormatter.format(date)} at ${time}`;
}

// The order tracker's ETA line (the app's getEtaDisplay).
export function etaLine(order: {
  estimated_ready_at: string | null;
  requested_ready_at: string | null;
  status: string;
  order_type: string;
}): string | null {
  const { estimated_ready_at, requested_ready_at, status, order_type } = order;
  if (!estimated_ready_at || status === "completed" || status === "cancelled") return null;
  if (order_type === "pickup" && status === "ready") return "Ready for pickup!";
  if (requested_ready_at) {
    const label = formatDayAndTime(new Date(requested_ready_at));
    return order_type === "delivery" ? `Arriving ${label}` : `Ready ${label}`;
  }
  const minsLeft = Math.ceil((new Date(estimated_ready_at).getTime() - Date.now()) / 60000);
  if (status === "out_for_delivery") return minsLeft > 0 ? `Arriving in about ${minsLeft} min` : "Arriving any minute now";
  return minsLeft > 0 ? `Ready in about ${minsLeft} min` : "Running a few minutes behind, almost there!";
}

// A clock time on the store's clock, e.g. "6:45 PM".
export const clockTime = (iso: string) => formatSlotTime(new Date(iso));
