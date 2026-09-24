// Quantity modifier groups (modifier_groups.allow_quantity) store "2x Fat
// Tony" as two separate modifiers. For display, fold repeats back into one
// entry with a count, keeping the order they were first picked in.
export function groupRepeats<T>(items: T[], keyOf: (item: T) => string): { item: T; count: number }[] {
  const groups = new Map<string, { item: T; count: number }>();
  for (const item of items) {
    const key = keyOf(item);
    const existing = groups.get(key);
    if (existing) existing.count += 1;
    else groups.set(key, { item, count: 1 });
  }
  return Array.from(groups.values());
}
