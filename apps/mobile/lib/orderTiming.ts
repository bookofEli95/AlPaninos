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
const MAX_SLOTS = 6;
const WINDOW_MINUTES = 120;
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

function formatSlotTime(date: Date): string {
  let h = date.getHours();
  const m = date.getMinutes();
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m.toString().padStart(2, '0')} ${suffix}`;
}

// An uncertain "~15-20 min" invites repeated checking and in-person "is it
// ready yet" queue pressure; a committed clock time doesn't. Slots start at
// the earliest the kitchen could realistically have it ready (rounded up to
// a clean 15-minute mark) and stop at whichever comes first: today's
// closing time or a 2-hour window -- capped at a handful of options rather
// than every slot until close, since a long list is its own friction and
// nobody's ordering lunch four hours ahead anyway.
export function getPickupSlots(
  hours: WeekHours | null | undefined,
  orderType: 'pickup' | 'delivery',
  itemCount: number
): PickupSlot[] {
  const minMinutes = estimateReadyMinutes(orderType, itemCount);
  const now = new Date();
  const earliest = new Date(now.getTime() + minMinutes * 60000);
  earliest.setMinutes(Math.ceil(earliest.getMinutes() / SLOT_INTERVAL_MINUTES) * SLOT_INTERVAL_MINUTES, 0, 0);

  let closeAt: Date | null = null;
  const today = hours?.[DAY_NAMES[now.getDay()]];
  if (today) {
    const [closeH, closeM] = today.close.split(':').map(Number);
    closeAt = new Date(now);
    closeAt.setHours(closeH, closeM, 0, 0);
  }

  const windowEnd = new Date(now.getTime() + WINDOW_MINUTES * 60000);
  const cutoff = closeAt && closeAt < windowEnd ? closeAt : windowEnd;

  const slots: PickupSlot[] = [];
  let slotTime = new Date(earliest);
  while (slotTime <= cutoff && slots.length < MAX_SLOTS) {
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
    const label = new Date(requestedReadyAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return orderType === 'delivery' ? `Arriving around ${label}` : `Ready at ${label}`;
  }

  const minsLeft = Math.ceil((new Date(estimatedReadyAt).getTime() - Date.now()) / 60000);

  if (status === 'out_for_delivery') {
    return minsLeft > 0 ? `Arriving in ~${minsLeft} min` : 'Arriving any minute now';
  }
  return minsLeft > 0 ? `Ready in ~${minsLeft} min` : 'Running a few minutes behind — almost there!';
}
