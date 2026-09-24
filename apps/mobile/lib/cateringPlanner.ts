// "Feeding N people" planner for the catering menu. Works off each
// package's own serves_max and catering_role (see the catering_tools
// migration), so new or re-priced packages are planned for automatically.

export type PlannerPackage = {
  id: string;
  name: string;
  base_price: number;
  serves_min: number | null;
  serves_max: number | null;
  catering_role: string | null;
};

export type PlanLine = { pkg: PlannerPackage; quantity: number };

export type CateringPlan = {
  mains: PlanLine[];
  drinks: PlanLine[];
  // How many people the mains feed at most, e.g. 20 for two 8-10 boards.
  mainsServe: number;
  total: number;
};

export const PLANNER_MIN_PEOPLE = 5;
export const PLANNER_MAX_PEOPLE = 150;
export const PLANNER_DEFAULT_PEOPLE = 15;

const serves = (p: PlannerPackage) => p.serves_max ?? p.serves_min ?? 0;

// The cheapest mix of packages that covers at least `people` (unbounded
// knapsack over headcount). On a price tie, fewer packages wins -- one Big
// Board beats two small ones at the same price.
function cheapestCover(people: number, packages: PlannerPackage[]): PlanLine[] {
  const usable = packages.filter((p) => serves(p) > 0);
  if (people <= 0 || usable.length === 0) return [];

  const cost: number[] = new Array(people + 1).fill(Infinity);
  const count: number[] = new Array(people + 1).fill(Infinity);
  const pick: number[] = new Array(people + 1).fill(-1);
  cost[0] = 0;
  count[0] = 0;

  for (let n = 1; n <= people; n++) {
    usable.forEach((p, i) => {
      const rest = Math.max(0, n - serves(p));
      const c = cost[rest] + Number(p.base_price);
      const k = count[rest] + 1;
      // Rounded so floating-point pennies don't decide a tie.
      const better = Math.round(c * 100) < Math.round(cost[n] * 100);
      const tie = Math.round(c * 100) === Math.round(cost[n] * 100) && k < count[n];
      if (better || tie) {
        cost[n] = c;
        count[n] = k;
        pick[n] = i;
      }
    });
  }

  const quantities = new Map<number, number>();
  for (let n = people; n > 0 && pick[n] >= 0; ) {
    const i = pick[n];
    quantities.set(i, (quantities.get(i) ?? 0) + 1);
    n = Math.max(0, n - serves(usable[i]));
  }
  return Array.from(quantities.entries())
    .map(([i, quantity]) => ({ pkg: usable[i], quantity }))
    .sort((a, b) => serves(b.pkg) - serves(a.pkg));
}

// Mains to feed everyone, plus one drink a head.
export function planCatering(people: number, packages: PlannerPackage[]): CateringPlan {
  const mains = cheapestCover(people, packages.filter((p) => p.catering_role === 'main'));
  const drinks = cheapestCover(people, packages.filter((p) => p.catering_role === 'drink'));
  const lineTotal = (lines: PlanLine[]) => lines.reduce((sum, l) => sum + Number(l.pkg.base_price) * l.quantity, 0);
  return {
    mains,
    drinks,
    mainsServe: mains.reduce((sum, l) => sum + serves(l.pkg) * l.quantity, 0),
    total: lineTotal(mains) + lineTotal(drinks),
  };
}
