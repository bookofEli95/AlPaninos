// PaninoPoints -- the app's lib/points.ts: 10 points per $1 of the order's
// subtotal, credited once the order is completed (award_points_on_completion).
export const POINTS_PER_DOLLAR = 10;

export const REWARD_TIERS = [
  { cost: 150, title: "Free Dip", one: "a free dip" },
  { cost: 300, title: "Free Drink", one: "a free drink" },
  { cost: 600, title: "Free Specialty Side", one: "a free specialty side" },
  { cost: 1200, title: "Free Signature Sandwich", one: "a free sandwich" },
] as const;

export function pointsForSubtotal(subtotal: number): number {
  return Math.floor(subtotal * POINTS_PER_DOLLAR);
}

// "120 more for a free drink" -- or, past the top reward, what they'll have.
export function pointsProgressLabel(balanceAfter: number): string {
  const next = REWARD_TIERS.find((t) => t.cost > balanceAfter);
  if (next) return `${(next.cost - balanceAfter).toLocaleString()} more for ${next.one}`;
  const n = Math.floor(balanceAfter / 1200);
  return `you'll have enough for ${n === 1 ? "a free sandwich" : `${n} free sandwiches`}`;
}

// Progress toward the next reward, 0-1.
export function pointsProgress(balance: number): { next: (typeof REWARD_TIERS)[number] | null; ratio: number } {
  const next = REWARD_TIERS.find((t) => t.cost > balance) ?? null;
  if (!next) return { next: null, ratio: 1 };
  const prevCost = [...REWARD_TIERS].reverse().find((t) => t.cost <= balance)?.cost ?? 0;
  return { next, ratio: (balance - prevCost) / (next.cost - prevCost) };
}
