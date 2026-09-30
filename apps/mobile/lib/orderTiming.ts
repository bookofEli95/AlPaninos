import { WeekHours } from './hours';

// There's no kitchen/staff app yet setting real prep times, so checkout
// (cart.tsx) computes a one-time estimate from order size -- plus a bit
// more while the store is busy (rushMinutes, from hooks/useStoreRush) --
// and stores it; the tracking screen (order/[id].tsx) just counts down
// against that fixed timestamp instead of re-guessing on every render.
export function estimateReadyMinutes(orderType: 'pickup' | 'delivery', itemCount: number, rushMinutes = 0): number {
  const base = orderType === 'delivery' ? 35 : 20;
  const extra = Math.min(Math.max(itemCount - 1, 0) * 2, 20);
  return base + extra + rushMinutes;
}

export type PickupSlot = { time: Date; label: string };

const SLOT_INTERVAL_MINUTES = 15;
export const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

export function formatSlotTime(date: Date): string {
  let h = date.getHours();
  const m = date.getMinutes();
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m.toString().padStart(2, '0')} ${suffix}`;
}

// The store's opening/closing time on a given calendar day, as Dates.
function hoursOn(hours: WeekHours, date: Date): { openAt: Date; closeAt: Date } | null {
  const day = hours[DAY_NAMES[date.getDay()]];
  if (!day) return null;
  const [openH, openM] = day.open.split(':').map(Number);
  const [closeH, closeM] = day.close.split(':').map(Number);
  return {
    openAt: new Date(date.getFullYear(), date.getMonth(), date.getDate(), openH, openM),
    closeAt: new Date(date.getFullYear(), date.getMonth(), date.getDate(), closeH, closeM),
  };
}

// Whether an order can be made right now ("ASAP"): the store is open, and
// the order can be ready before it closes. No hours on file counts as open
// (the same as Home). When this is false, the order has to be scheduled
// for a time the store is open (getOrderDays).
export function canOrderAsap(
  hours: WeekHours | null | undefined,
  orderType: 'pickup' | 'delivery',
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

export type OrderDay = { date: Date; label: string; slots: PickupSlot[] };

// Every time an order can be ready for, grouped by day: the rest of today
// (if the store's still open, or opens later today) and the next days it
// opens -- up to three days with times. Each day's times run every 15
// minutes from the earliest the kitchen could have it ready (the order
// size's prep time after now, or after opening if it isn't open yet) until
// closing. A committed clock time beats an open-ended "~20 min": it stops
// the "is it ready yet" checking.
export function getOrderDays(
  hours: WeekHours | null | undefined,
  orderType: 'pickup' | 'delivery',
  itemCount: number,
  rushMinutes = 0,
  now: Date = new Date()
): OrderDay[] {
  if (!hours) return [];
  const prepMs = estimateReadyMinutes(orderType, itemCount, rushMinutes) * 60000;
  const days: OrderDay[] = [];

  for (let ahead = 0; ahead < 8 && days.length < 3; ahead++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ahead);
    const open = hoursOn(hours, date);
    if (!open) continue;

    const earliest = new Date(Math.max(now.getTime(), open.openAt.getTime()) + prepMs);
    earliest.setMinutes(Math.ceil(earliest.getMinutes() / SLOT_INTERVAL_MINUTES) * SLOT_INTERVAL_MINUTES, 0, 0);

    const slots: PickupSlot[] = [];
    for (let t = earliest; t <= open.closeAt; t = new Date(t.getTime() + SLOT_INTERVAL_MINUTES * 60000)) {
      slots.push({ time: new Date(t), label: formatSlotTime(t) });
    }
    if (!slots.length) continue;

    const label =
      ahead === 0
        ? 'Today'
        : ahead === 1
        ? 'Tomorrow'
        : date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
    days.push({ date, label, slots });
  }
  return days;
}

// A chosen time that's still possible: in the future by at least the prep
// time, and inside the store's hours that day.
export function isOrderTimeAvailable(
  time: Date,
  hours: WeekHours | null | undefined,
  orderType: 'pickup' | 'delivery',
  itemCount: number,
  rushMinutes = 0,
  now: Date = new Date()
): boolean {
  if (time.getTime() < now.getTime() + estimateReadyMinutes(orderType, itemCount, rushMinutes) * 60000 - 60000) return false;
  if (!hours) return true;
  const day = hoursOn(hours, time);
  return !!day && time >= day.openAt && time <= day.closeAt;
}

export function getEtaDisplay(
  estimatedReadyAt: string | null,
  status: string,
  orderType: string,
  requestedReadyAt?: string | null
): string | null {
  if (!estimatedReadyAt || status === 'completed' || status === 'cancelled') return null;
  if (orderType === 'pickup' && status === 'ready') return 'Ready for pickup!';

  // The customer committed to a specific clock time at checkout (cart.tsx's
  // slot picker) -- show that instead of a live countdown, which is exactly
  // the open-ended uncertainty a chosen slot was meant to remove.
  if (requestedReadyAt) {
    const label = formatDayAndTime(new Date(requestedReadyAt));
    return orderType === 'delivery' ? `Arriving ${label}` : `Ready ${label}`;
  }

  const minsLeft = Math.ceil((new Date(estimatedReadyAt).getTime() - Date.now()) / 60000);

  if (status === 'out_for_delivery') {
    return minsLeft > 0 ? `Arriving in ~${minsLeft} min` : 'Arriving any minute now';
  }
  return minsLeft > 0 ? `Ready in ~${minsLeft} min` : 'Running a few minutes behind — almost there!';
}

// "at 11:30 AM" today, "tomorrow at 11:30 AM", otherwise "Tue, Sep 29 at
// 11:30 AM" -- catering orders are scheduled days ahead, so a bare time
// would read as today.
export function formatDayAndTime(date: Date, now: Date = new Date()): string {
  const time = formatSlotTime(date);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(date) - startOfDay(now)) / 86400000);
  if (dayDiff === 0) return `at ${time}`;
  if (dayDiff === 1) return `tomorrow at ${time}`;
  const day = date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  return `${day} at ${time}`;
}
