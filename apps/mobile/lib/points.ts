// Mirrors award_points_on_completion() (the panino_points migration): 10
// PaninoPoints per $1 of the order's subtotal, credited once it's completed.
export const POINTS_PER_DOLLAR = 10;

export function pointsForSubtotal(subtotal: number): number {
  return Math.floor(subtotal * POINTS_PER_DOLLAR);
}

// Same costs as redeem_points_reward() and the Deals screen's tiers.
const REWARD_TIERS = [
  { cost: 1200, one: 'a free sandwich', many: (n: number) => `${n} free sandwiches` },
  { cost: 600, one: 'a free specialty side', many: (n: number) => `${n} free specialty sides` },
  { cost: 300, one: 'a free drink', many: (n: number) => `${n} free drinks` },
];

// What a points balance buys at the biggest tier it reaches, e.g.
// "2 free sandwiches" -- null below the cheapest reward.
export function pointsRewardLabel(points: number): string | null {
  const tier = REWARD_TIERS.find((t) => points >= t.cost);
  if (!tier) return null;
  const n = Math.floor(points / tier.cost);
  return n === 1 ? tier.one : tier.many(n);
}

// The cart's "This order earns ..." nudge, from where the customer will be
// after this order: how far to the next reward, or what they'll have
// enough for once past the top one ("you'll have enough for 2 free
// sandwiches").
export function pointsProgressLabel(balanceAfter: number): string {
  const next = [...REWARD_TIERS].reverse().find((t) => t.cost > balanceAfter);
  if (next) return `${(next.cost - balanceAfter).toLocaleString()} more for ${next.one}`;
  return `you'll have enough for ${pointsRewardLabel(balanceAfter)}`;
}
