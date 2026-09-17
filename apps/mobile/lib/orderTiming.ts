// There's no kitchen/staff app yet setting real prep times, so checkout
// (cart.tsx) computes a one-time estimate from order size and stores it --
// the tracking screen (order/[id].tsx) just counts down against that fixed
// timestamp instead of re-guessing on every render.
export function estimateReadyMinutes(orderType: 'pickup' | 'delivery', itemCount: number): number {
  const base = orderType === 'delivery' ? 35 : 20;
  const extra = Math.min(Math.max(itemCount - 1, 0) * 2, 20);
  return base + extra;
}

export function getEtaDisplay(
  estimatedReadyAt: string | null,
  status: string,
  orderType: string
): string | null {
  if (!estimatedReadyAt || status === 'completed' || status === 'cancelled') return null;
  if (orderType === 'pickup' && status === 'ready') return 'Ready for pickup!';

  const minsLeft = Math.ceil((new Date(estimatedReadyAt).getTime() - Date.now()) / 60000);

  if (status === 'out_for_delivery') {
    return minsLeft > 0 ? `Arriving in ~${minsLeft} min` : 'Arriving any minute now';
  }
  return minsLeft > 0 ? `Ready in ~${minsLeft} min` : 'Running a few minutes behind — almost there!';
}
