import type { CartOption } from "@/lib/cart";
import { optionsConflict } from "./modifier-conflicts";

// An item's choices, the way the app's item screen works them: every group
// in order (a group under an option appears once that option is picked),
// the defaults pre-picked, contradictory choices ("No Provolone" + "Extra
// Provolone") swapping each other out, quantity groups with - / +. Shared
// by the item builder and the catering form.

export type ChoiceOption = {
  id: string;
  group_id: string;
  name: string;
  price_adjustment: number;
  is_default: boolean | null;
  menu_item_id?: string | null;
  description?: string | null;
};

export type ChoiceGroup = {
  id: string;
  name: string;
  parent_option_id: string | null;
  is_required: boolean | null;
  min_selections: number | null;
  max_selections: number | null;
  allow_quantity: boolean;
  options: ChoiceOption[];
};

// Picked option ids by group; an id twice is two of it.
export type Selections = Record<string, string[]>;

export const minFor = (g: ChoiceGroup) => g.min_selections || (g.is_required ? 1 : 0);

export function defaultSelections(groups: ChoiceGroup[]): Selections {
  const defaults: Selections = {};
  const apply = (group: ChoiceGroup) => {
    let chosen = group.options.filter((o) => o.is_default).map((o) => o.id);
    if (!chosen.length && group.is_required && group.max_selections === 1 && group.options.length) chosen = [group.options[0].id];
    if (chosen.length) defaults[group.id] = chosen;
    chosen.forEach((id) => groups.filter((g) => g.parent_option_id === id).forEach(apply));
  };
  groups.filter((g) => !g.parent_option_id).forEach(apply);
  return defaults;
}

// Back from a line's options to the picks, by group.
export function selectionsFromOptions(groups: ChoiceGroup[], options: { optionId: string }[]): Selections {
  const byGroup: Selections = {};
  for (const o of options) {
    const g = groups.find((gr) => gr.options.some((opt) => opt.id === o.optionId));
    if (g) (byGroup[g.id] ??= []).push(o.optionId);
  }
  return byGroup;
}

export function visibleGroups(groups: ChoiceGroup[], selections: Selections): ChoiceGroup[] {
  const chosen = new Set(Object.values(selections).flat());
  const result: ChoiceGroup[] = [];
  const add = (group: ChoiceGroup) => {
    result.push(group);
    group.options.forEach((o) => chosen.has(o.id) && groups.filter((g) => g.parent_option_id === o.id).forEach(add));
  };
  groups.filter((g) => !g.parent_option_id).forEach(add);
  return result;
}

// Unpicking an option takes the groups under it (and their picks) away.
function clearChildren(groups: ChoiceGroup[], removed: string[], next: Selections): Selections {
  const out = { ...next };
  const queue = [...removed];
  while (queue.length) {
    const id = queue.shift()!;
    groups
      .filter((g) => g.parent_option_id === id)
      .forEach((g) => {
        queue.push(...(out[g.id] ?? []));
        delete out[g.id];
      });
  }
  return out;
}

// Groups that just appeared (picking "Sandwiches, salad & cookies" brings
// up Salad and Dessert) start on their defaults, like the item did.
function defaultsForNewGroups(groups: ChoiceGroup[], prev: Selections, next: Selections): Selections {
  const before = new Set(visibleGroups(groups, prev).map((g) => g.id));
  let out = next;
  for (let pass = 0; pass < 5; pass++) {
    const fresh = visibleGroups(groups, out).filter((g) => !before.has(g.id) && !(out[g.id]?.length));
    const filled = fresh.flatMap((g) => {
      let chosen = g.options.filter((o) => o.is_default).map((o) => o.id);
      if (!chosen.length && g.is_required && g.max_selections === 1 && g.options.length) chosen = [g.options[0].id];
      return chosen.length ? [[g.id, chosen] as const] : [];
    });
    if (!filled.length) break;
    out = { ...out, ...Object.fromEntries(filled) };
    fresh.forEach((g) => before.add(g.id));
  }
  return out;
}

export function toggleChoice(groups: ChoiceGroup[], prev: Selections, group: ChoiceGroup, optionId: string): Selections {
  return defaultsForNewGroups(groups, prev, toggleOnly(groups, prev, group, optionId));
}

function toggleOnly(groups: ChoiceGroup[], prev: Selections, group: ChoiceGroup, optionId: string): Selections {
  const optionName = (id: string) => groups.flatMap((g) => g.options).find((o) => o.id === id)?.name ?? "";
  const inGroup = prev[group.id] ?? [];
  if (inGroup.includes(optionId)) {
    return clearChildren(groups, [optionId], { ...prev, [group.id]: inGroup.filter((id) => id !== optionId) });
  }
  const newName = optionName(optionId);
  const conflicting = Object.values(prev)
    .flat()
    .filter((id) => optionsConflict(optionName(id), newName));
  let next = prev;
  if (conflicting.length) {
    next = clearChildren(groups, conflicting, Object.fromEntries(Object.entries(prev).map(([g, ids]) => [g, ids.filter((id) => !conflicting.includes(id))])));
  }
  if (group.max_selections === 1) return clearChildren(groups, inGroup, { ...next, [group.id]: [optionId] });
  const now = next[group.id] ?? [];
  if (group.max_selections && now.length >= group.max_selections) return next;
  return { ...next, [group.id]: [...now, optionId] };
}

export function changeChoiceCount(prev: Selections, group: ChoiceGroup, optionId: string, delta: 1 | -1): Selections {
  const now = prev[group.id] ?? [];
  if (delta > 0) {
    if (group.max_selections && now.length >= group.max_selections) return prev;
    return { ...prev, [group.id]: [...now, optionId] };
  }
  const i = now.lastIndexOf(optionId);
  if (i < 0) return prev;
  const next = [...now];
  next.splice(i, 1);
  return { ...prev, [group.id]: next };
}

// The first shown group still short of what it needs.
export const missingGroup = (shown: ChoiceGroup[], selections: Selections) => shown.find((g) => (selections[g.id]?.length ?? 0) < minFor(g));

// One of the item: its price plus every picked option shown.
export function priceWithChoices(basePrice: number, shown: ChoiceGroup[], selections: Selections): number {
  let total = Number(basePrice);
  shown.forEach((g) => {
    const picked = selections[g.id] ?? [];
    g.options.forEach((o) => (total += Number(o.price_adjustment) * picked.filter((id) => id === o.id).length));
  });
  return total;
}

// The picks as the cart keeps them: one entry per one picked.
export function cartOptions(shown: ChoiceGroup[], selections: Selections): CartOption[] {
  return shown.flatMap((g) =>
    g.options.flatMap((o) =>
      Array.from({ length: (selections[g.id] ?? []).filter((id) => id === o.id).length }, () => ({ optionId: o.id, name: o.name, price: Number(o.price_adjustment) }))
    )
  );
}
