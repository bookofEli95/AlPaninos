import { WeekHours } from './hours';

// There's no kitchen/staff app yet setting real prep times, so checkout
// (cart.tsx) computes a one-time estimate from order size and stores it --
// the tracking screen (order/[id].tsx) just counts down against that fixed
// timestamp instead of re-guessing on every render.
export function estimateReadyMinutes(orderType: 'pickup' | 'delivery', itemCount: number): number {
  const base = orderType === 'delivery' ? 35 : 20;
  const extra = Math.min(Math.max(itemCount - 1, 0) * 2, 20);
  return base + extra;
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

// An uncertain "~15-20 min" invites repeated checking and in-person "is it
// ready yet" queue pressure; a committed clock time doesn't. Slots start at
// the earliest the kitchen could realistically have it ready (rounded up to
// a clean 15-minute mark) and run every 15 minutes all the way to today's
// closing time -- e.g. ordering at noon still offers an 8pm slot if the
// store's open that late. No artificial cap: this feeds a scrollable
// dropdown (cart.tsx), not a row of chips, so a long list isn't a problem.
export function getPickupSlots(
  hours: WeekHours | null | undefined,
  orderType: 'pickup' | 'delivery',
  itemCount: number
): PickupSlot[] {
  const today = hours?.[DAY_NAMES[new Date().getDay()]];
  if (!today) return [];

  const minMinutes = estimateReadyMinutes(orderType, itemCount);
  const now = new Date();
  const earliest = new Date(now.getTime() + minMinutes * 60000);
  earliest.setMinutes(Math.ceil(earliest.getMinutes() / SLOT_INTERVAL_MINUTES) * SLOT_INTERVAL_MINUTES, 0, 0);

  const [closeH, closeM] = today.close.split(':').map(Number);
  const closeAt = new Date(now);
  closeAt.setHours(closeH, closeM, 0, 0);

  const slots: PickupSlot[] = [];
  let slotTime = new Date(earliest);
  while (slotTime <= closeAt) {
    slots.push({ time: new Date(slotTime), label: formatSlotTime(slotTime) });
    slotTime = new Date(slotTime.getTime() + SLOT_INTERVAL_MINUTES * 60000);
  }
  return slots;
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
